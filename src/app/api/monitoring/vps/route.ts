import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { getVpsDiskAndBackup } from "@/lib/monitoring/ssh"
import { prisma } from "@/lib/prisma"

/** List semua VpsServer + Application di bawahnya, plus cek live disk usage & backup terakhir
 *  lewat SSH (dijalankan paralel per VPS, mirror pola live-check di databases/route.ts). Field
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
        createdAt: vps.createdAt,
        disk: live.disk,
        diskError: live.diskError,
        backupLatestFile: live.backupLatestFile,
        backupLatestAt: live.backupLatestAt,
        backupError: live.backupError,
        applications: vps.applications.map((app) => ({
          id: app.id,
          name: app.name,
          domain: app.domain,
          gitRepository: app.gitRepository,
          gitBranch: app.gitBranch,
          backupLocation: app.backupLocation,
          lastBackupAt: app.lastBackupAt,
          lastAccessedAt: app.lastAccessedAt,
          domainExpiresAt: app.domainExpiresAt,
          domainExpiryCheckedAt: app.domainExpiryCheckedAt,
          notes: app.notes,
          hasCoolifySync: Boolean(app.coolifyUuid),
        })),
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
      sshPassword: sshPassword || null,
      sshPrivateKey: sshPrivateKey || null,
      diskPath,
      backupCheckPath: backupCheckPath || null,
      proxyContainerName,
      coolifyApiUrl: coolifyApiUrl || null,
      coolifyApiToken: coolifyApiToken || null,
      createdById: user.id,
    },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json(created, { status: 201 })
}
