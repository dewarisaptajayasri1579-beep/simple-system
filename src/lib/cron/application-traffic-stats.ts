import { jakartaTodayDateIso, parseJakartaDateIso } from "@/lib/datetime"
import { collectTrafficWindow } from "@/lib/monitoring/traefik-access"
import { prisma } from "@/lib/prisma"

const FALLBACK_LOOKBACK_MS = 130 * 60 * 1000
const MAX_LOOKBACK_MS = 26 * 60 * 60 * 1000

/** Rekap traffic (bandwidth + kunjungan unik) per aplikasi, buat KPI "Sering/Normal/Jarang
 *  digunakan" (lihat ApplicationDailyStat di schema.prisma). Dipanggil cron TIAP JAM (bukan
 *  sekali sehari) — window `[VpsServer.trafficCollectedUntil, now)` per VPS, BUKAN window mundur
 *  tetap (mis. 130 menit) — window tetap kepakai lagi di jalan berikutnya bikin log yang sama
 *  kebaca ulang dan requestCount/bandwidthBytes ke-DOUBLE-COUNT (bug nyata ketahuan 2026-09-21
 *  pas testing manual, 2x jalan berturutan bikin angkanya dobel padahal trafiknya sama). Cursor
 *  per-VPS memastikan tiap baris log CUMA diproses SEKALI: begitu 1 jalan sukses, cursor maju ke
 *  `until` window itu, jadi jalan berikutnya otomatis mulai persis dari situ — tidak tumpang
 *  tindih, dan kalau 1 jalan ke-skip (server sibuk dsb) cursor lama otomatis bikin window
 *  berikutnya mundur lebih jauh buat nutup celahnya (dibatasi MAX_LOOKBACK_MS supaya tidak coba
 *  baca log yang sudah pasti ke-rotasi kalau cursor-nya kelewat basi).
 *
 *  Window bisa nyebrang 1 batas hari WIB (dekat tengah malam) — collectTrafficWindow() sudah
 *  mengelompokkan per tanggal kalender Jakarta sendiri, jadi di sini tinggal loop per tanggal
 *  yang muncul. `referenceDate` dependency-injectable buat testing manual (default: sekarang). */
export async function runApplicationTrafficIncrement(referenceDate: Date = new Date()) {
  const until = referenceDate

  const vpsList = await prisma.vpsServer.findMany({
    include: { applications: { where: { domain: { not: null } } } },
  })

  let appsUpdated = 0
  for (const vps of vpsList) {
    if (vps.applications.length === 0) continue
    const domains = vps.applications.map((a) => a.domain).filter((d): d is string => Boolean(d))

    const oldestAllowedSince = new Date(until.getTime() - MAX_LOOKBACK_MS)
    const since = !vps.trafficCollectedUntil
      ? new Date(until.getTime() - FALLBACK_LOOKBACK_MS)
      : vps.trafficCollectedUntil > oldestAllowedSince
        ? vps.trafficCollectedUntil
        : oldestAllowedSince
    if (since >= until) continue

    try {
      const byDate = await collectTrafficWindow(vps, domains, since, until)
      for (const [dateIso, byDomain] of byDate) {
        const targetDate = parseJakartaDateIso(dateIso)
        for (const app of vps.applications) {
          if (!app.domain) continue
          const stat = byDomain.get(app.domain)
          if (!stat) continue

          const existing = await prisma.applicationDailyStat.findUnique({
            where: { applicationId_date: { applicationId: app.id, date: targetDate } },
            select: { visitorIps: true, requestCount: true, bandwidthBytes: true },
          })
          const mergedIps = new Set([...(existing?.visitorIps ?? []), ...stat.ips])
          const totalRequestCount = (existing?.requestCount ?? 0) + stat.requestCount
          const totalBandwidthBytes = (existing?.bandwidthBytes ?? BigInt(0)) + BigInt(Math.round(stat.bandwidthBytes))

          await prisma.applicationDailyStat.upsert({
            where: { applicationId_date: { applicationId: app.id, date: targetDate } },
            create: {
              applicationId: app.id,
              date: targetDate,
              uniqueVisitors: mergedIps.size,
              requestCount: totalRequestCount,
              bandwidthBytes: totalBandwidthBytes,
              visitorIps: [...mergedIps],
            },
            update: {
              uniqueVisitors: mergedIps.size,
              requestCount: totalRequestCount,
              bandwidthBytes: totalBandwidthBytes,
              visitorIps: [...mergedIps],
            },
          })
          appsUpdated += 1
        }
      }
      // Cursor cuma dimajukan kalau collectTrafficWindow BENERAN berhasil (tidak throw) — kalau
      // gagal (SSH timeout dsb), cursor lama dipertahankan supaya jalan berikutnya otomatis
      // nyoba lagi dari titik yang sama, bukan diam-diam melompati window yang belum terproses.
      await prisma.vpsServer.update({ where: { id: vps.id }, data: { trafficCollectedUntil: until } }).catch(() => {})
    } catch (e) {
      console.error(`[application-traffic-increment] gagal untuk VPS "${vps.name}":`, e)
    }
  }

  return { targetDateIso: jakartaTodayDateIso(referenceDate), appsUpdated }
}
