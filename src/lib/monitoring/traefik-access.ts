import { sshExec, vpsSshCreds, type VpsSshLike } from "./ssh"

export type VpsProxyLike = VpsSshLike & { proxyContainerName: string }

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parseClfDate(raw: string): Date | null {
  const m = raw.match(/^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/)
  if (!m) return null
  const [, day, mon, year, hh, mm, ss, sign, tzh, tzm] = m
  const month = MONTHS[mon]
  if (month === undefined) return null
  const utcMs = Date.UTC(Number(year), month, Number(day), Number(hh), Number(mm), Number(ss))
  const offsetMin = (Number(tzh) * 60 + Number(tzm)) * (sign === "-" ? -1 : 1)
  return new Date(utcMs - offsetMin * 60000)
}

/** Cari timestamp terakhir untuk satu baris log — coba format JSON access log Traefik dulu
 *  (`"StartUTC":"..."` / `"time":"..."`), fallback ke Common Log Format (`[19/Sep/2026:10:00:00 +0000]`)
 *  kalau access log-nya di-set format text biasa. */
function extractTimestamp(line: string): Date | null {
  const jsonMatch = line.match(/"(?:StartUTC|time)":"([^"]+)"/)
  if (jsonMatch) {
    const d = new Date(jsonMatch[1])
    if (!Number.isNaN(d.getTime())) return d
  }
  const clfMatch = line.match(/\[(\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4})\]/)
  if (clfMatch) return parseClfDate(clfMatch[1])
  return null
}

/** IP client ada di baris log yang sama dengan timestamp-nya — JSON access log Traefik simpan di
 *  field "ClientHost" (IP murni, beda dari "ClientAddr" yang masih "ip:port"), format CLF simpan
 *  di token PALING AWAL baris (`%h` — remote host). */
function extractClientIp(line: string): string | null {
  const jsonMatch = line.match(/"ClientHost":"([^"]+)"/)
  if (jsonMatch) return jsonMatch[1]
  const clfMatch = line.match(/^(\S+)\s+\S+\s+\S+\s+\[/)
  if (clfMatch) return clfMatch[1]
  return null
}

export type LastAccessEntry = { at: Date; ip: string | null }

/** Ambil timestamp + IP client dari request TERAKHIR per domain dari log akses container reverse
 *  proxy Coolify (default "coolify-proxy", yaitu Traefik) — 1 SSH call per VPS untuk SEMUA domain
 *  sekaligus (bukan per-app), supaya tidak buka banyak koneksi SSH cuma buat baca log yang sama
 *  berulang. Best-effort: kalau container tidak ada / access log Traefik tidak aktif / format log
 *  tidak dikenali, domain itu cuma tidak ke-update — tidak melempar error ke pemanggil (lihat
 *  src/lib/cron/vps-monitoring.ts yang menjalankan ini per VPS). */
export async function getLastAccessedByDomain(vps: VpsProxyLike, domains: string[]): Promise<Map<string, LastAccessEntry>> {
  const result = new Map<string, LastAccessEntry>()
  const cleanDomains = [...new Set(domains.map((d) => d.trim()).filter(Boolean))]
  if (cleanDomains.length === 0) return result

  let logs: string
  try {
    logs = await sshExec(vpsSshCreds(vps), `docker logs ${vps.proxyContainerName} --since 24h 2>&1 | tail -n 20000`, 15000)
  } catch {
    return result
  }

  const lines = logs.split("\n")
  for (const domain of cleanDomains) {
    let latest: LastAccessEntry | null = null
    for (const line of lines) {
      if (!line.includes(domain)) continue
      const ts = extractTimestamp(line)
      if (ts && (!latest || ts > latest.at)) latest = { at: ts, ip: extractClientIp(line) }
    }
    if (latest) result.set(domain, latest)
  }
  return result
}
