/** Suffix multi-bagian yang umum dipakai (bukan Public Suffix List penuh, cuma yang realistis
 *  kepakai) — dipakai supaya "app.contoh.co.id" di-lookup sebagai "contoh.co.id" ke RDAP, bukan
 *  salah jadi "co.id". Best-effort: domain dengan suffix di luar daftar ini fallback ke 2 bagian
 *  terakhir, yang bisa salah untuk ccTLD multi-bagian yang tidak terdaftar di sini — kalau itu
 *  terjadi, isi manual field `domainExpiresAt` di UI sebagai override. */
const MULTI_PART_SUFFIXES = new Set([
  "co.id", "or.id", "ac.id", "go.id", "web.id", "net.id", "sch.id", "biz.id", "my.id",
  "co.uk", "org.uk", "gov.uk", "ac.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "com.sg",
])

export function registrableDomain(fqdn: string): string {
  const parts = fqdn.toLowerCase().trim().split(".").filter(Boolean)
  if (parts.length <= 2) return parts.join(".")
  const lastTwo = parts.slice(-2).join(".")
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join(".")
  return lastTwo
}

type RdapEvent = { eventAction?: string; eventDate?: string }
type IanaBootstrapService = [string[], string[]]

/** Cache bootstrap RDAP resmi IANA (peta TLD -> server RDAP registry-nya) di memori proses —
 *  datanya resmi & jarang berubah, jadi TTL 24 jam cukup, tidak perlu fetch ulang tiap lookup
 *  domain. Kalau fetch ulang gagal (network flapping dsb), tetap pakai cache lama yang masih ada
 *  daripada gagal total — cuma expired kalau BELUM PERNAH berhasil fetch sama sekali. */
let bootstrapCache: { services: IanaBootstrapService[]; fetchedAt: number } | null = null
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000

function findRdapServer(services: IanaBootstrapService[], tld: string): string | null {
  const entry = services.find(([tlds]) => tlds.includes(tld))
  const base = entry?.[1]?.[0]
  return base ? base.replace(/\/+$/, "") : null
}

async function getRdapServerForTld(tld: string): Promise<string | null> {
  const isStale = !bootstrapCache || Date.now() - bootstrapCache.fetchedAt > BOOTSTRAP_TTL_MS
  if (isStale) {
    try {
      const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data?.services)) bootstrapCache = { services: data.services, fetchedAt: Date.now() }
      }
    } catch {
      // best-effort — kalau ada cache lama (walau sudah lewat TTL), tetap dipakai di bawah
      // daripada lookup gagal total gara-gara IANA lagi tidak bisa diakses sesaat.
    }
  }
  return bootstrapCache ? findRdapServer(bootstrapCache.services, tld) : null
}

/** Cari tanggal expiry domain lewat RDAP (pengganti WHOIS, gratis tanpa API key) — lookup server
 *  RDAP registry yang BENAR buat TLD domain ini lewat bootstrap resmi IANA (data.iana.org), lalu
 *  query LANGSUNG ke situ (mis. Verisign buat .com, PANDI buat .id) — BUKAN lewat proxy rdap.org
 *  seperti sebelumnya, karena rdap.org ternyata memblokir request otomatis kita dengan tantangan
 *  Cloudflare (403), bikin fitur ini diam-diam gagal total sejak entah kapan tanpa ketahuan (lihat
 *  percakapan monitoring 2026-09-21 — audit nemu 0 dari 31 aplikasi berhasil dapat domainExpiresAt
 *  dari RDAP, padahal cron-nya jalan rutin tiap hari). Best-effort — return null kalau TLD-nya
 *  tidak ada di bootstrap IANA atau request ke registry-nya gagal, TIDAK melempar error ke
 *  pemanggil (dipakai di cron harian, satu domain gagal tidak boleh gagalkan yang lain — lihat
 *  src/lib/cron/vps-monitoring.ts). */
export async function lookupDomainExpiry(domain: string): Promise<Date | null> {
  const registrable = registrableDomain(domain)
  if (!registrable) return null
  const tld = registrable.split(".").pop()
  if (!tld) return null

  const server = await getRdapServerForTld(tld)
  if (!server) return null

  try {
    const res = await fetch(`${server}/domain/${encodeURIComponent(registrable)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const events: RdapEvent[] = Array.isArray(data?.events) ? data.events : []
    const expiration = events.find((e) => e.eventAction === "expiration")
    if (!expiration?.eventDate) return null
    const parsed = new Date(expiration.eventDate)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}
