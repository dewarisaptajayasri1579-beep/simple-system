import { prisma } from "@/lib/prisma"
import { lookupIpCity } from "@/lib/monitoring/geoip"
import { ensureDatabaseBackups, syncCoolifyApplications } from "@/lib/monitoring/coolify"
import { lookupDomainExpiry } from "@/lib/monitoring/rdap"
import { getVpsDockerDiskUsage } from "@/lib/monitoring/ssh"
import { getLastAccessedByDomain } from "@/lib/monitoring/traefik-access"

/** Cron tiap jam modul Monitoring Server untuk "VPS Lain": (1) sync aplikasi dari Coolify API
 *  kalau VPS itu dikasih kredensial, (2) cek expiry domain lewat RDAP untuk semua domain aplikasi
 *  yang terdaftar, (3) cek "terakhir diakses" lewat log akses Traefik per VPS, (4) refresh cache
 *  breakdown disk Docker (lambat, lihat getVpsDockerDiskUsage). Semua best-effort — satu
 *  VPS/domain gagal tidak boleh menggagalkan yang lain. Tanpa `vpsId` jalan buat SEMUA VPS (dipakai
 *  cron jam-jaman); dikasih `vpsId` cuma scope ke satu VPS itu (dipakai tombol "Sync & Cek
 *  Sekarang" per VPS — POST /api/monitoring/vps/[id]/refresh-checks, owner-only). */
export async function runVpsMonitoringRefresh(vpsId?: string) {
  const vpsList = await prisma.vpsServer.findMany(vpsId ? { where: { id: vpsId } } : undefined)

  let coolifySynced = 0
  let backupsAutoCreated = 0
  for (const vps of vpsList) {
    if (!vps.coolifyApiUrl || !vps.coolifyApiToken) continue
    try {
      const r = await syncCoolifyApplications(vps)
      coolifySynced += r.synced
    } catch (e) {
      console.error(`[vps-monitoring] sync Coolify gagal untuk VPS "${vps.name}":`, e)
    }
    // Auto-setup backup-ke-R2 buat database baru yang belum punya jadwal backup sama sekali —
    // butuh coolifyApiToken dengan ability `write` (bukan cuma `read` yang cukup buat sync di
    // atas), kalau token belum di-upgrade, ini gagal senyap (dicatat di log, tidak menggagalkan
    // sync lain). Lihat ensureDatabaseBackups() di lib/monitoring/coolify.ts.
    try {
      const r = await ensureDatabaseBackups(vps)
      backupsAutoCreated += r.created
    } catch (e) {
      console.error(`[vps-monitoring] auto-setup backup gagal untuk VPS "${vps.name}":`, e)
    }
  }

  const refreshedVpsList = await prisma.vpsServer.findMany({
    where: vpsId ? { id: vpsId } : undefined,
    include: { applications: true },
  })
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
  // Dikumpulin dulu SEMUA VPS (bukan langsung ditulis per VPS) supaya geolocation IP-nya bisa
  // di-batch sekali per IP UNIK di bawah — kalau beberapa aplikasi/VPS ke-akses dari IP yang sama
  // (mis. kantor sendiri), tidak perlu lookup berkali-kali ke API geolocation.
  const pendingAccessUpdates: { appId: string; at: Date; ip: string | null }[] = []
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
        pendingAccessUpdates.push({ appId: app.id, at: last.at, ip: last.ip })
      }
    } catch (e) {
      console.error(`[vps-monitoring] cek akses gagal untuk VPS "${vps.name}":`, e)
    }
  }

  let accessChecked = 0
  for (const u of pendingAccessUpdates) {
    await prisma.application
      .update({ where: { id: u.appId }, data: { lastAccessedAt: u.at, lastAccessedIp: u.ip } })
      .catch(() => {})
    accessChecked += 1
  }

  // Geolocation IP → kota SENGAJA TIDAK di-await di sini — request ke API luar (ipapi.co) bisa
  // lambat/kena rate limit, dan proses sync utama (termasuk disk Docker di bawah, yang sudah
  // lama ~20-25 detik) tidak boleh ikut ketunda cuma buat info kota yang sifatnya pelengkap.
  // Jalan di background (proses Node tetap hidup setelah response dikirim, self-hosted bukan
  // serverless) — DB keupdate belakangan, kolom "Login Terakhir" baru kelihatan kota-nya pas
  // halaman di-reload berikutnya, bukan langsung pas tombol "Sync & Cek Sekarang" selesai.
  const ipToAppIds = new Map<string, string[]>()
  for (const u of pendingAccessUpdates) {
    if (!u.ip) continue
    const list = ipToAppIds.get(u.ip) ?? []
    list.push(u.appId)
    ipToAppIds.set(u.ip, list)
  }
  void Promise.all(
    [...ipToAppIds.entries()].map(async ([ip, appIds]) => {
      const city = await lookupIpCity(ip)
      if (!city) return
      await prisma.application.updateMany({ where: { id: { in: appIds } }, data: { lastAccessedCity: city } }).catch(() => {})
    })
  ).catch((e) => console.error("[vps-monitoring] geolocation IP background gagal:", e))

  let dockerDiskRefreshed = 0
  for (const vps of vpsList) {
    try {
      const result = await getVpsDockerDiskUsage(vps)
      if (!result.dockerDisk) continue
      await prisma.vpsServer.update({
        where: { id: vps.id },
        data: {
          dockerDiskCache: { dockerDisk: result.dockerDisk, containers: result.containers ?? [], volumes: result.volumes ?? [] },
          dockerDiskCheckedAt: new Date(),
        },
      })
      dockerDiskRefreshed += 1
    } catch (e) {
      console.error(`[vps-monitoring] cek disk Docker gagal untuk VPS "${vps.name}":`, e)
    }
  }

  return { vpsCount: vpsList.length, coolifySynced, backupsAutoCreated, domainsChecked, accessChecked, dockerDiskRefreshed }
}
