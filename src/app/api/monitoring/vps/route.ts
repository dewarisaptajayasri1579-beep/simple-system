import { NextResponse } from "next/server"

import { latestBackupPerGroup } from "@/lib/backup/r2"
import { encryptSecret } from "@/lib/crypto"
import { getApiUser } from "@/lib/current-user"
import { jakartaTodayDateIso, parseJakartaDateIso, shiftJakartaDateIso } from "@/lib/datetime"
import { resolveDomainExpiry } from "@/lib/domain-status"
import { canViewMonitoring } from "@/lib/monitoring"
import { coolifyResourceLink, prettifyDatabaseType, r2BucketForVps } from "@/lib/monitoring/coolify"
import { registrableDomain } from "@/lib/monitoring/rdap"
import { getVpsDiskAndBackup, type ContainerDiskEntry, type DockerDiskEntry, type VolumeDiskEntry } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

type DockerDiskCache = {
  dockerDisk: DockerDiskEntry[] | null
  containers: ContainerDiskEntry[] | null
  volumes: VolumeDiskEntry[] | null
}

type CoolifyDatabaseCacheEntry = {
  uuid: string
  name: string
  databaseType: string
  status: string | null
  lastOnlineAt: string | null
  projectName: string | null
  projectUuid: string | null
  environmentUuid: string | null
}

/** Ukuran database yang BENAR itu named volume-nya (mis. "postgres-data-<uuid>"), BUKAN
 *  `docker ps -s` punya container-nya — data Postgres/MySQL/dst disimpan di Docker volume
 *  terpisah, jadi "virtual size" container (dominan ukuran image dasar) nyaris SAMA buat semua
 *  container yang pakai image sama, tidak mencerminkan data sungguhan (lihat percakapan
 *  monitoring: 3 database beda isi semua kebaca "~313MB" karena itu ukuran image postgres-nya,
 *  bukan datanya). Volume tidak punya split writable/virtual kayak container, jadi kedua field
 *  diisi nilai yang sama supaya tetap kompatibel dengan komponen <DiskContribution> yang ada. */
function databaseVolumeUsage(
  volumes: VolumeDiskEntry[] | null | undefined,
  databaseUuid: string
): { size: string; virtualSize: string } | null {
  const volume = volumes?.find((v) => v.name.includes(databaseUuid))
  return volume ? { size: volume.size, virtualSize: volume.size } : null
}

const TRAFFIC_WINDOW_DAYS = 7
type UsageLabel = "sering" | "normal" | "jarang"

/** Klasifikasi "Sering/Normal/Jarang digunakan" dari rata-rata kunjungan (IP unik) per hari
 *  selama TRAFFIC_WINDOW_DAYS hari terakhir — ambang batas ANGKA TETAP yang ditentukan user
 *  langsung (bukan dihitung relatif antar aplikasi), lihat percakapan monitoring soal KPI
 *  per-aplikasi. Sengaja disimpan sebagai konstanta di sini, gampang diubah 1 tempat kalau
 *  ternyata kurang pas setelah lihat data riil. */
function classifyUsage(avgVisitorsPerDay: number): UsageLabel {
  if (avgVisitorsPerDay >= 20) return "sering"
  if (avgVisitorsPerDay >= 5) return "normal"
  return "jarang"
}

/** List semua VpsServer + Application di bawahnya. Disk usage & backup terakhir dicek LIVE (cepat,
 *  ~1-2 detik) tiap request, tapi breakdown disk Docker (lambat, ~20-25 detik) dibaca dari CACHE
 *  (`VpsServer.dockerDiskCache`, diisi lewat cron harian atau tombol "Cek Sekarang" —
 *  POST /api/monitoring/vps/[id]/docker-disk) supaya halaman tidak nunggu lama tiap dibuka. Field
 *  kredensial (sshPassword, sshPrivateKey, coolifyApiToken) SENGAJA tidak pernah dikirim ke
 *  client — cuma dipakai server-side buat SSH/Coolify call. */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const vpsList = await prisma.vpsServer.findMany({
    orderBy: { createdAt: "asc" },
    include: { applications: { orderBy: { name: "asc" } } },
  })

  // Domain root (mis. "onyseven.com") dikelola manual di Pengaturan > Master Data > Domain —
  // itu acuan resmi tanggal renewal, beda dari `Application.domainExpiresAt` yang auto-lookup
  // RDAP per SUBDOMAIN aplikasi. Batch satu kali di sini (bukan query per-app di dalam loop,
  // lihat aturan N+1 di CLAUDE.md) buat dicocokkan ke tiap VPS di bawah.
  const allRootDomains = new Set<string>()
  for (const vps of vpsList) {
    for (const app of vps.applications) {
      if (app.domain) allRootDomains.add(registrableDomain(app.domain).toLowerCase())
    }
  }
  const domainRows = allRootDomains.size
    ? await prisma.domain.findMany({
        where: { name: { in: [...allRootDomains] } },
        select: { name: true, expiryDate: true, lastPaidAt: true, active: true },
      })
    : []
  const domainByName = new Map(domainRows.map((d) => [d.name.toLowerCase(), d]))

  // Tiap VPS bisa punya bucket R2 sendiri (VpsServer.r2BucketName, lihat percakapan monitoring
  // soal pisah bucket per VPS) — sekali panggil PER BUCKET UNIK (bukan per VPS, apalagi di dalam
  // loop — lihat aturan N+1 di CLAUDE.md), hasilnya digabung sebelum dicocokkan ke tiap
  // aplikasi/database di bawah. Best-effort per bucket: kalau satu bucket R2 lagi bermasalah,
  // cuma kolom "DB Backup" VPS yang pakai bucket itu yang kosong, bukan bikin seluruh halaman gagal.
  const uniqueBuckets = [...new Set(vpsList.map((vps) => r2BucketForVps(vps)))]
  const dbBackupsByBucket = await Promise.all(
    uniqueBuckets.map((bucket) => latestBackupPerGroup(bucket).catch(() => [] as Awaited<ReturnType<typeof latestBackupPerGroup>>))
  )
  const dbBackups = dbBackupsByBucket.flat()

  // KPI "Sering/Normal/Jarang digunakan" per aplikasi — 1 query buat SEMUA aplikasi sekaligus
  // (bukan per-app di dalam loop, lihat aturan N+1 di CLAUDE.md), di-grouping di JS. Datanya diisi
  // cron harian jam 00:15 WIB (lihat runApplicationTrafficStats di src/lib/cron/
  // application-traffic-stats.ts) yang parse log Traefik — TIDAK dihitung on-demand di sini
  // karena log itu sendiri cuma nyimpen ~24-30 jam, tidak cukup buat window 7 hari.
  const allAppIds = vpsList.flatMap((vps) => vps.applications.map((a) => a.id))
  const trafficWindowStart = parseJakartaDateIso(shiftJakartaDateIso(jakartaTodayDateIso(), -TRAFFIC_WINDOW_DAYS))
  const trafficStats = allAppIds.length
    ? await prisma.applicationDailyStat.findMany({
        where: { applicationId: { in: allAppIds }, date: { gte: trafficWindowStart } },
        select: { applicationId: true, uniqueVisitors: true, bandwidthBytes: true },
      })
    : []
  const trafficByAppId = new Map<string, { uniqueVisitors: number; bandwidthBytes: bigint }[]>()
  for (const row of trafficStats) {
    if (!trafficByAppId.has(row.applicationId)) trafficByAppId.set(row.applicationId, [])
    trafficByAppId.get(row.applicationId)!.push(row)
  }

  const results = await Promise.all(
    vpsList.map(async (vps) => {
      const live = await getVpsDiskAndBackup(vps)
      const cache = (vps.dockerDiskCache as unknown as DockerDiskCache | null) ?? null

      // Semua database Coolify di VPS ini (daftar mentah hasil sync, coolifyDatabasesCache) —
      // termasuk yang tidak ke-match ke aplikasi manapun (mis. dibuat berdiri sendiri, tanpa
      // aplikasi yang connect via DATABASE_URL — lihat percakapan monitoring "os-template").
      // DB Backup dicocokkan sama seperti di applications[] (group.endsWith(uuid)).
      const coolifyDatabases = (vps.coolifyDatabasesCache as unknown as CoolifyDatabaseCacheEntry[] | null) ?? []
      const databases = coolifyDatabases.map((db) => {
        const dbBackup = dbBackups.find((b) => b.group.endsWith(db.uuid)) ?? null
        return {
          uuid: db.uuid,
          name: db.name,
          databaseType: prettifyDatabaseType(db.databaseType),
          diskUsage: databaseVolumeUsage(cache?.volumes, db.uuid),
          // Status Coolify formatnya "running:healthy" / "exited:unhealthy" dst — "Aktif" kalau
          // state container-nya "running", apa pun status health check-nya.
          isActive: db.status?.startsWith("running") ?? false,
          lastOnlineAt: db.lastOnlineAt,
          dbBackupAt: dbBackup?.createdTime ?? null,
          dbBackupLink: dbBackup?.webViewLink ?? null,
          projectName: db.projectName,
          coolifyLink: coolifyResourceLink(vps.coolifyApiUrl, "database", db.projectUuid, db.environmentUuid, db.uuid),
        }
      })

      const rootDomainNames = [...new Set(vps.applications.map((a) => a.domain).filter((d): d is string => Boolean(d)).map((d) => registrableDomain(d).toLowerCase()))]
      const registeredDomains = rootDomainNames.map((name) => {
        const row = domainByName.get(name)
        return {
          name,
          tracked: Boolean(row),
          active: row?.active ?? null,
          expiryDate: row ? (resolveDomainExpiry(row)?.toISOString() ?? null) : null,
        }
      })

      return {
        id: vps.id,
        name: vps.name,
        host: vps.host,
        sshPort: vps.sshPort,
        sshUser: vps.sshUser,
        diskPath: vps.diskPath,
        backupCheckPath: vps.backupCheckPath,
        proxyContainerName: vps.proxyContainerName,
        hasCoolify: Boolean(vps.coolifyApiUrl && vps.coolifyApiToken),
        coolifyApiUrl: vps.coolifyApiUrl,
        coolifyDatabaseCount: vps.coolifyDatabaseCount,
        createdAt: vps.createdAt,
        disk: live.disk,
        diskError: live.diskError,
        backupLatestFile: live.backupLatestFile,
        backupLatestAt: live.backupLatestAt,
        backupError: live.backupError,
        cpu: live.cpu,
        cpuError: live.cpuError,
        cpuCores: live.cpuCores,
        ram: live.ram,
        ramError: live.ramError,
        swap: live.swap,
        uptimeSeconds: live.uptimeSeconds,
        dockerDisk: cache?.dockerDisk ?? null,
        dockerVolumes: cache?.volumes ?? null,
        dockerDiskCheckedAt: vps.dockerDiskCheckedAt,
        registeredDomains,
        databases,
        applications: vps.applications.map((app) => {
          const appContainer = app.coolifyUuid ? cache?.containers?.find((c) => c.coolifyAppUuid === app.coolifyUuid) : undefined
          // Subdomain ikut persis expiry domain root-nya (tidak punya tanggal registrasi
          // sendiri) — kalau RDAP per-app belum/gagal ke-lookup (domainExpiresAt null), fallback
          // ke data resmi Pengaturan > Domain yang sudah dicocokkan di atas, supaya kolom "Domain
          // Habis" tidak nyangkut di "Belum diketahui" padahal domain root-nya sudah terdaftar.
          const rootDomainRow = app.domain ? domainByName.get(registrableDomain(app.domain).toLowerCase()) : undefined
          const domainExpiresAt = app.domainExpiresAt ?? (rootDomainRow ? (resolveDomainExpiry(rootDomainRow)?.toISOString() ?? null) : null)
          // Cocokkan ke folder backup R2 lewat UUID database Coolify (nama folder Coolify selalu
          // diakhiri UUID resource database-nya, lihat lib/backup/r2.ts § latestBackupPerGroup).
          const dbBackup = app.databaseUuid ? dbBackups.find((b) => b.group.endsWith(app.databaseUuid!)) ?? null : null

          const trafficRows = trafficByAppId.get(app.id) ?? []
          const traffic =
            trafficRows.length > 0
              ? (() => {
                  const bandwidthBytes7d = trafficRows.reduce((sum, r) => sum + Number(r.bandwidthBytes), 0)
                  const totalVisitors = trafficRows.reduce((sum, r) => sum + r.uniqueVisitors, 0)
                  const activeDays7d = trafficRows.filter((r) => r.uniqueVisitors > 0).length
                  const avgVisitorsPerDay = totalVisitors / TRAFFIC_WINDOW_DAYS
                  return { bandwidthBytes7d, avgVisitorsPerDay, activeDays7d, label: classifyUsage(avgVisitorsPerDay) }
                })()
              : null

          return {
            id: app.id,
            name: app.name,
            domain: app.domain,
            gitRepository: app.gitRepository,
            gitBranch: app.gitBranch,
            databaseInfo: app.databaseInfo,
            activityQuery: app.activityQuery,
            backupLocation: app.backupLocation,
            lastBackupAt: app.lastBackupAt,
            databaseUuid: app.databaseUuid,
            dbBackupAt: dbBackup?.createdTime ?? null,
            dbBackupLink: dbBackup?.webViewLink ?? null,
            lastAccessedAt: app.lastAccessedAt,
            lastAccessedBy: app.lastAccessedBy,
            lastAccessedIp: app.lastAccessedIp,
            lastAccessedCity: app.lastAccessedCity,
            coolifyProjectName: app.coolifyProjectName,
            coolifyLink: coolifyResourceLink(vps.coolifyApiUrl, "application", app.coolifyProjectUuid, app.coolifyEnvironmentUuid, app.coolifyUuid),
            domainExpiresAt,
            domainExpiryCheckedAt: app.domainExpiryCheckedAt,
            notes: app.notes,
            hasCoolifySync: Boolean(app.coolifyUuid),
            diskUsage: appContainer ? { size: appContainer.size, virtualSize: appContainer.virtualSize } : null,
            databaseDiskUsage: app.databaseUuid ? databaseVolumeUsage(cache?.volumes, app.databaseUuid) : null,
            traffic,
          }
        }),
      }
    })
  )

  return NextResponse.json(results)
}

/** Tambah VPS baru — cuma Owner (isinya kredensial SSH/Coolify). Wajib salah satu dari
 *  sshPassword/sshPrivateKey. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa tambah VPS" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const host = typeof body?.host === "string" ? body.host.trim() : ""
  const sshUser = typeof body?.sshUser === "string" ? body.sshUser.trim() : ""
  const sshPassword = typeof body?.sshPassword === "string" ? body.sshPassword.trim() : ""
  const sshPrivateKey = typeof body?.sshPrivateKey === "string" ? body.sshPrivateKey.trim() : ""
  const sshPortNum = Number(body?.sshPort)
  const sshPort = Number.isFinite(sshPortNum) && sshPortNum > 0 ? sshPortNum : 22
  const diskPath = typeof body?.diskPath === "string" && body.diskPath.trim() ? body.diskPath.trim() : "/"
  const backupCheckPath = typeof body?.backupCheckPath === "string" ? body.backupCheckPath.trim() : ""
  const proxyContainerName =
    typeof body?.proxyContainerName === "string" && body.proxyContainerName.trim() ? body.proxyContainerName.trim() : "coolify-proxy"
  const coolifyApiUrl = typeof body?.coolifyApiUrl === "string" ? body.coolifyApiUrl.trim() : ""
  const coolifyApiToken = typeof body?.coolifyApiToken === "string" ? body.coolifyApiToken.trim() : ""

  if (!name || !host || !sshUser) {
    return NextResponse.json({ error: "Nama, host, dan SSH user wajib diisi" }, { status: 400 })
  }
  if (!sshPassword && !sshPrivateKey) {
    return NextResponse.json({ error: "Isi salah satu: SSH password atau SSH private key" }, { status: 400 })
  }

  const created = await prisma.vpsServer.create({
    data: {
      name,
      host,
      sshUser,
      sshPort,
      sshPassword: sshPassword ? encryptSecret(sshPassword) : null,
      sshPrivateKey: sshPrivateKey ? encryptSecret(sshPrivateKey) : null,
      diskPath,
      backupCheckPath: backupCheckPath || null,
      proxyContainerName,
      coolifyApiUrl: coolifyApiUrl || null,
      coolifyApiToken: coolifyApiToken ? encryptSecret(coolifyApiToken) : null,
      createdById: user.id,
    },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json(created, { status: 201 })
}
