import { jakartaTodayDateIso, parseJakartaDateIso, shiftJakartaDateIso } from "@/lib/datetime"
import { aggregateDailyTraffic } from "@/lib/monitoring/traefik-access"
import { prisma } from "@/lib/prisma"

/** Rekap traffic (bandwidth + kunjungan unik) hari SEBELUMNYA per aplikasi, buat KPI
 *  "Sering/Normal/Jarang digunakan" (lihat ApplicationDailyStat di schema.prisma). Dipanggil cron
 *  jam 00:15 WIB (instrumentation.ts) — direkap SEKALI per hari (bukan on-demand) karena log
 *  Traefik sendiri cuma nyimpen ~24-30 jam, tidak bisa dipakai buat tren berhari-hari. Best-effort
 *  per VPS — satu VPS gagal (mis. akses log belum diaktifkan, lihat panduan di form Tambah VPS)
 *  tidak boleh gagalkan VPS lain. `referenceDate` dibikin dependency-injectable buat testing/
 *  backfill manual (default hari ini → target-nya kemarin). */
export async function runApplicationTrafficStats(referenceDate: Date = new Date()) {
  const targetDateIso = shiftJakartaDateIso(jakartaTodayDateIso(referenceDate), -1)
  const targetDate = parseJakartaDateIso(targetDateIso)

  const vpsList = await prisma.vpsServer.findMany({
    include: { applications: { where: { domain: { not: null } } } },
  })

  let appsUpdated = 0
  for (const vps of vpsList) {
    if (vps.applications.length === 0) continue
    const domains = vps.applications.map((a) => a.domain).filter((d): d is string => Boolean(d))

    try {
      const statsByDomain = await aggregateDailyTraffic(vps, domains, targetDateIso)
      for (const app of vps.applications) {
        if (!app.domain) continue
        const stat = statsByDomain.get(app.domain)
        if (!stat) continue

        await prisma.applicationDailyStat.upsert({
          where: { applicationId_date: { applicationId: app.id, date: targetDate } },
          create: {
            applicationId: app.id,
            date: targetDate,
            uniqueVisitors: stat.uniqueVisitors,
            requestCount: stat.requestCount,
            bandwidthBytes: BigInt(Math.round(stat.bandwidthBytes)),
          },
          update: {
            uniqueVisitors: stat.uniqueVisitors,
            requestCount: stat.requestCount,
            bandwidthBytes: BigInt(Math.round(stat.bandwidthBytes)),
          },
        })
        appsUpdated += 1
      }
    } catch (e) {
      console.error(`[application-traffic-stats] gagal untuk VPS "${vps.name}":`, e)
    }
  }

  return { targetDateIso, appsUpdated }
}
