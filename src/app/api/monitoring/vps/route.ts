import { NextResponse } from "next/server"

import { latestBackupPerGroup } from "@/lib/backup/r2"
import { encryptSecret } from "@/lib/crypto"
import { getApiUser } from "@/lib/current-user"
import { resolveDomainExpiry } from "@/lib/domain-status"
import { canViewMonitoring } from "@/lib/monitoring"
import { registrableDomain } from "@/lib/monitoring/rdap"
import { getVpsDiskAndBackup, type ContainerDiskEntry, type DockerDiskEntry, type VolumeDiskEntry } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

type DockerDiskCache = {
  dockerDisk: DockerDiskEntry[] | null
  containers: ContainerDiskEntry[] | null
  volumes: VolumeDiskEntry[] | null
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

  // Sekali panggil buat semua VPS/aplikasi (bukan di dalam loop) — lihat aturan N+1 di CLAUDE.md.
  // Best-effort: kalau R2 lagi bermasalah, kolom "DB Backup" cuma kosong, bukan bikin seluruh
  // halaman Monitoring gagal load.
  const dbBackups = await latestBackupPerGroup().catch(() => [] as Awaited<ReturnType<typeof latestBackupPerGroup>>)

  const results = await Promise.all(
    vpsList.map(async (vps) => {
      const live = await getVpsDiskAndBackup(vps)
      const cache = (vps.dockerDiskCache as unknown as DockerDiskCache | null) ?? null

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
        dockerDisk: cache?.dockerDisk ?? null,
        dockerVolumes: cache?.volumes ?? null,
        dockerDiskCheckedAt: vps.dockerDiskCheckedAt,
        registeredDomains,
        applications: vps.applications.map((app) => {
          const appContainer = app.coolifyUuid ? cache?.containers?.find((c) => c.coolifyAppUuid === app.coolifyUuid) : undefined
          const dbContainer = app.databaseUuid ? cache?.containers?.find((c) => c.containerName === app.databaseUuid) : undefined
          // Subdomain ikut persis expiry domain root-nya (tidak punya tanggal registrasi
          // sendiri) — kalau RDAP per-app belum/gagal ke-lookup (domainExpiresAt null), fallback
          // ke data resmi Pengaturan > Domain yang sudah dicocokkan di atas, supaya kolom "Domain
          // Habis" tidak nyangkut di "Belum diketahui" padahal domain root-nya sudah terdaftar.
          const rootDomainRow = app.domain ? domainByName.get(registrableDomain(app.domain).toLowerCase()) : undefined
          const domainExpiresAt = app.domainExpiresAt ?? (rootDomainRow ? (resolveDomainExpiry(rootDomainRow)?.toISOString() ?? null) : null)
          // Cocokkan ke folder backup R2 lewat UUID database Coolify (nama folder Coolify selalu
          // diakhiri UUID resource database-nya, lihat lib/backup/r2.ts § latestBackupPerGroup).
          const dbBackup = app.databaseUuid ? dbBackups.find((b) => b.group.endsWith(app.databaseUuid!)) ?? null : null
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
            dbBackupAt: dbBackup?.createdTime ?? null,
            dbBackupLink: dbBackup?.webViewLink ?? null,
            lastAccessedAt: app.lastAccessedAt,
            lastAccessedBy: app.lastAccessedBy,
            domainExpiresAt,
            domainExpiryCheckedAt: app.domainExpiryCheckedAt,
            notes: app.notes,
            hasCoolifySync: Boolean(app.coolifyUuid),
            diskUsage: appContainer ? { size: appContainer.size, virtualSize: appContainer.virtualSize } : null,
            databaseDiskUsage: dbContainer ? { size: dbContainer.size, virtualSize: dbContainer.virtualSize } : null,
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
