import { prisma } from "@/lib/prisma"
import { syncCoolifyApplications } from "@/lib/monitoring/coolify"
import { lookupDomainExpiry } from "@/lib/monitoring/rdap"
import { getLastAccessedByDomain } from "@/lib/monitoring/traefik-access"

/** Cron harian modul Monitoring Server untuk "VPS Lain": (1) sync aplikasi dari Coolify API kalau
 *  VPS itu dikasih kredensial, (2) cek expiry domain lewat RDAP untuk semua domain aplikasi yang
 *  terdaftar, (3) cek "terakhir diakses" lewat log akses Traefik per VPS. Semua best-effort — satu
 *  VPS/domain gagal tidak boleh menggagalkan yang lain. Bisa dipicu manual lewat
 *  POST /api/monitoring/vps/refresh-checks (tombol "Sync & Cek Sekarang", owner-only). */
export async function runVpsMonitoringRefresh() {
  const vpsList = await prisma.vpsServer.findMany()

  let coolifySynced = 0
  for (const vps of vpsList) {
    if (!vps.coolifyApiUrl || !vps.coolifyApiToken) continue
    try {
      const r = await syncCoolifyApplications(vps)
      coolifySynced += r.synced
    } catch (e) {
      console.error(`[vps-monitoring] sync Coolify gagal untuk VPS "${vps.name}":`, e)
    }
  }

  const refreshedVpsList = await prisma.vpsServer.findMany({ include: { applications: true } })
  const allApps = refreshedVpsList.flatMap((v) => v.applications)

  const uniqueDomains = [...new Set(allApps.map((a) => a.domain).filter((d): d is string => !!d))]
  const expiryMap = new Map<string, Date>()
  await Promise.all(
    uniqueDomains.map(async (domain) => {
      const exp = await lookupDomainExpiry(domain)
      if (exp) expiryMap.set(domain, exp)
    })
  )

  let domainsChecked = 0
  for (const app of allApps) {
    if (!app.domain) continue
    const exp = expiryMap.get(app.domain)
    await prisma.application
      .update({
        where: { id: app.id },
        data: exp ? { domainExpiresAt: exp, domainExpiryCheckedAt: new Date() } : { domainExpiryCheckedAt: new Date() },
      })
      .catch(() => {})
    if (exp) domainsChecked += 1
  }

  // Log Traefik cuma dipakai buat aplikasi yang BELUM punya activityQuery — kalau aplikasi itu
  // punya query manual (dijalankan di syncCoolifyApplications, lebih akurat karena tahu identitas
  // user), jangan ditimpa tebakan dari log Traefik yang cuma tahu "ada request", bukan "siapa".
  let accessChecked = 0
  for (const vps of refreshedVpsList) {
    const appsWithoutQuery = vps.applications.filter((a) => !a.activityQuery)
    const domains = appsWithoutQuery.map((a) => a.domain).filter((d): d is string => !!d)
    if (domains.length === 0) continue
    try {
      const lastMap = await getLastAccessedByDomain(vps, domains)
      for (const app of appsWithoutQuery) {
        if (!app.domain) continue
        const last = lastMap.get(app.domain)
        if (!last) continue
        await prisma.application.update({ where: { id: app.id }, data: { lastAccessedAt: last } })
        accessChecked += 1
      }
    } catch (e) {
      console.error(`[vps-monitoring] cek akses gagal untuk VPS "${vps.name}":`, e)
    }
  }

  return { vpsCount: vpsList.length, coolifySynced, domainsChecked, accessChecked }
}
