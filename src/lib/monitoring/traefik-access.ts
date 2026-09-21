import { jakartaTodayDateIso } from "@/lib/datetime"

import { sshExec, sudoWrap, vpsSshCreds, type VpsSshLike } from "./ssh"

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

/** Domain yang di-request — cuma didukung di format JSON ("RequestHost"), field ini tidak ada
 *  representasinya yang gampang diparsing di format CLF text lama, jadi rekap harian
 *  (aggregateDailyTraffic) cuma jalan kalau access log Traefik di-set `--accesslog.format=json`
 *  (lihat panduan setup di form Tambah VPS). */
function extractRequestHost(line: string): string | null {
  const m = line.match(/"RequestHost":"([^"]+)"/)
  return m ? m[1] : null
}

/** Bytes yang beneran dikirim ke client (sudah termasuk gzip kalau ada) — ini yang dipakai
 *  sebagai "Bandwidth" di KPI, bukan OriginContentSize (ukuran sebelum kompresi dari origin). */
function extractDownstreamSize(line: string): number {
  const m = line.match(/"DownstreamContentSize":(\d+)/)
  return m ? Number(m[1]) : 0
}

function extractStatus(line: string): number | null {
  const m = line.match(/"DownstreamStatus":(\d+)/)
  return m ? Number(m[1]) : null
}

function extractRequestPath(line: string): string | null {
  const m = line.match(/"RequestPath":"([^"]*)"/)
  return m ? m[1] : null
}

/** Path yang lazim diketuk bot/crawler/scanner, BUKAN navigasi user beneran — dicek terpisah dari
 *  status karena bot kadang dapat 200 (mis. robots.txt beneran ada). */
const BOT_PATH_PATTERNS = [
  /^\/robots\.txt$/i,
  /^\/favicon\.ico$/i,
  /^\/sitemap\.xml$/i,
  /^\/\.well-known\//i,
  /^\/wp-login\.php$/i,
  /^\/wp-admin/i,
  /^\/xmlrpc\.php$/i,
]

/** Baris log dianggap BUKAN kunjungan user asli kalau responsnya gagal (bukan 2xx/3xx — mis.
 *  request nyasar ke catchall router karena app-nya lagi tidak reachable, dapat 503) ATAU path-nya
 *  cuma metadata yang lazim diketuk bot (robots.txt, favicon, wp-login, dst). Dipakai
 *  getLastAccessedByDomain supaya "Terakhir Diakses" tidak ketipu bot/request gagal yang kebetulan
 *  timestamp-nya paling baru (bug nyata, ketahuan 2026-09-21: robots.txt dari bot, status 503,
 *  kepilih jadi "terakhir diakses" padahal bukan kunjungan beneran). Cuma berlaku format JSON
 *  (CLF text lama tidak punya representasi status/path yang gampang diparsing terpisah — baris
 *  CLF tetap dianggap valid apa adanya, best-effort). */
function isNoiseRequest(line: string): boolean {
  const status = extractStatus(line)
  if (status !== null && (status < 200 || status >= 400)) return true
  const path = extractRequestPath(line)
  if (path && BOT_PATH_PATTERNS.some((p) => p.test(path))) return true
  return false
}

export type LastAccessEntry = { at: Date; ip: string | null }

/** Ambil timestamp + IP client dari request TERAKHIR (yang lolos filter isNoiseRequest — bukan
 *  bot/scanner, bukan response gagal) per domain dari log akses container reverse proxy Coolify
 *  (default "coolify-proxy", yaitu Traefik) — 1 SSH call per VPS untuk SEMUA domain sekaligus
 *  (bukan per-app), supaya tidak buka banyak koneksi SSH cuma buat baca log yang sama berulang.
 *  Best-effort: kalau container tidak ada / access log Traefik tidak aktif / format log tidak
 *  dikenali, domain itu cuma tidak ke-update — tidak melempar error ke pemanggil (lihat
 *  src/lib/cron/vps-monitoring.ts yang menjalankan ini per VPS). */
export async function getLastAccessedByDomain(vps: VpsProxyLike, domains: string[]): Promise<Map<string, LastAccessEntry>> {
  const result = new Map<string, LastAccessEntry>()
  const cleanDomains = [...new Set(domains.map((d) => d.trim()).filter(Boolean))]
  if (cleanDomains.length === 0) return result

  let logs: string
  try {
    const creds = vpsSshCreds(vps)
    // User SSH non-root umumnya TIDAK punya akses langsung ke docker.sock — butuh sudo, sama
    // seperti semua command docker lain (lihat sudoWrap di ssh.ts). Tanpa ini, `docker logs`
    // gagal senyap dengan "permission denied" dan lastAccessedAt/lastAccessedIp tidak pernah
    // ke-isi buat aplikasi manapun yang pakai fallback ini (bug nyata, ketahuan pas debug).
    logs = await sshExec(creds, `${sudoWrap(creds.password, `docker logs ${vps.proxyContainerName} --since 24h 2>&1`)} | tail -n 20000`, 15000)
  } catch {
    return result
  }

  const lines = logs.split("\n")
  for (const domain of cleanDomains) {
    let latest: LastAccessEntry | null = null
    for (const line of lines) {
      if (!line.includes(domain)) continue
      if (isNoiseRequest(line)) continue
      const ts = extractTimestamp(line)
      if (ts && (!latest || ts > latest.at)) latest = { at: ts, ip: extractClientIp(line) }
    }
    if (latest) result.set(domain, latest)
  }
  return result
}

export type DailyTrafficStat = { uniqueVisitors: number; requestCount: number; bandwidthBytes: number }

/** Rekap traffic 1 hari KALENDER JAKARTA (`targetDateIso`, format "YYYY-MM-DD") per domain — beda
 *  dari getLastAccessedByDomain() yang cuma ambil 1 request TERAKHIR, ini scan SEMUA baris log
 *  buat hitung IP unik ("Kunjungan"), total request, dan total bytes ke client ("Bandwidth"). Baris
 *  yang lolos isNoiseRequest() (bot/scanner, response gagal) di-skip sama seperti
 *  getLastAccessedByDomain() — supaya KPI "Sering/Normal/Jarang digunakan" tidak ikut kegelembung
 *  bot (lihat percakapan monitoring 2026-09-21). Dipanggil cron harian jam 00:15 WIB buat rekap
 *  hari SEBELUMNYA — lihat runApplicationTrafficStats() di
 *  src/lib/cron/application-traffic-stats.ts.
 *
 *  Window `--since 30h` (bukan 24h kayak getLastAccessedByDomain) SENGAJA lebih lebar — supaya
 *  seluruh hari kemarin (00:00-23:59 Jakarta) kebaca penuh walau cron-nya baru jalan beberapa
 *  menit setelah tengah malam, bukan kepotong gara-gara window pas-pasan. Cuma dukung format JSON
 *  (butuh `--accesslog.format=json` di config Traefik) karena RequestHost/DownstreamContentSize
 *  tidak ada representasi gampang di format CLF text lama. */
export async function aggregateDailyTraffic(
  vps: VpsProxyLike,
  domains: string[],
  targetDateIso: string
): Promise<Map<string, DailyTrafficStat>> {
  const result = new Map<string, DailyTrafficStat>()
  const cleanDomains = new Set(domains.map((d) => d.trim()).filter(Boolean))
  if (cleanDomains.size === 0) return result

  let logs: string
  try {
    const creds = vpsSshCreds(vps)
    logs = await sshExec(
      creds,
      `${sudoWrap(creds.password, `docker logs ${vps.proxyContainerName} --since 30h 2>&1`)} | tail -n 200000`,
      25000
    )
  } catch {
    return result
  }

  const visitorsByDomain = new Map<string, Set<string>>()
  const requestCountByDomain = new Map<string, number>()
  const bandwidthByDomain = new Map<string, number>()

  for (const line of logs.split("\n")) {
    const ts = extractTimestamp(line)
    if (!ts || jakartaTodayDateIso(ts) !== targetDateIso) continue
    const host = extractRequestHost(line)
    if (!host || !cleanDomains.has(host)) continue
    if (isNoiseRequest(line)) continue

    const ip = extractClientIp(line)
    if (ip) {
      if (!visitorsByDomain.has(host)) visitorsByDomain.set(host, new Set())
      visitorsByDomain.get(host)!.add(ip)
    }
    requestCountByDomain.set(host, (requestCountByDomain.get(host) ?? 0) + 1)
    bandwidthByDomain.set(host, (bandwidthByDomain.get(host) ?? 0) + extractDownstreamSize(line))
  }

  for (const domain of cleanDomains) {
    const requestCount = requestCountByDomain.get(domain) ?? 0
    if (requestCount === 0) continue
    result.set(domain, {
      uniqueVisitors: visitorsByDomain.get(domain)?.size ?? 0,
      requestCount,
      bandwidthBytes: bandwidthByDomain.get(domain) ?? 0,
    })
  }
  return result
}
