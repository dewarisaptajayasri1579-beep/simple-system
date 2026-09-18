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

/** Cari tanggal expiry domain lewat RDAP (pengganti WHOIS, gratis tanpa API key). Best-effort —
 *  return null kalau registry domain itu tidak support RDAP atau request gagal, TIDAK melempar
 *  error ke pemanggil (dipakai di cron harian, satu domain gagal tidak boleh gagalkan yang lain —
 *  lihat src/lib/cron/vps-monitoring.ts). */
export async function lookupDomainExpiry(domain: string): Promise<Date | null> {
  const registrable = registrableDomain(domain)
  if (!registrable) return null

  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(registrable)}`, {
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
