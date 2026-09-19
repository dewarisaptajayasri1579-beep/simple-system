const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i

/** IP dari VPN internal/reverse-proxy langsung ke server (localhost, LAN, link-local) tidak
 *  berarti apa-apa buat geolocation — skip tanpa manggil API sama sekali. */
function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RE.test(ip.trim())
}

/** Geolocation IP → "Kota, Negara" pakai ipapi.co (gratis, tanpa API key, best-effort). Dipanggil
 *  cuma sekali per IP unik tiap sync (lihat src/lib/cron/vps-monitoring.ts) jadi jauh dari limit
 *  rate free tier-nya. Return null kalau IP privat/lookup gagal — TIDAK melempar error, satu IP
 *  gagal tidak boleh menggagalkan sync lain. */
export async function lookupIpCity(ip: string): Promise<string | null> {
  if (!ip || isPrivateIp(ip)) return null

  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = (await res.json()) as { error?: boolean; city?: string; country_name?: string; country?: string }
    if (!data || data.error) return null
    const city = typeof data.city === "string" && data.city.trim() ? data.city.trim() : null
    const country = typeof data.country_name === "string" && data.country_name.trim() ? data.country_name.trim() : (data.country ?? null)
    if (!city && !country) return null
    return [city, country].filter(Boolean).join(", ")
  } catch {
    return null
  }
}
