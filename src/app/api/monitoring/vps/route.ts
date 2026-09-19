import { NextResponse } from "next/server"

import { encryptSecret } from "@/lib/crypto"
import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { getVpsDiskAndBackup, type AppContainerDisk, type DockerDiskEntry } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

type DockerDiskCache = { dockerDisk: DockerDiskEntry[] | null; appDiskUsage: AppContainerDisk[] | null }

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

  const results = await Promise.all(
    vpsList.map(async (vps) => {
      const live = await getVpsDiskAndBackup(vps)
      const cache = (vps.dockerDiskCache as unknown as DockerDiskCache | null) ?? null

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
        dockerDiskCheckedAt: vps.dockerDiskCheckedAt,
        applications: vps.applications.map((app) => {
          const diskEntry = app.coolifyUuid ? cache?.appDiskUsage?.find((d) => d.coolifyUuid === app.coolifyUuid) : undefined
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
            lastAccessedAt: app.lastAccessedAt,
            lastAccessedBy: app.lastAccessedBy,
            domainExpiresAt: app.domainExpiresAt,
            domainExpiryCheckedAt: app.domainExpiryCheckedAt,
            notes: app.notes,
            hasCoolifySync: Boolean(app.coolifyUuid),
            diskUsage: diskEntry ? { size: diskEntry.size, virtualSize: diskEntry.virtualSize } : null,
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
