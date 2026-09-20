import { NextResponse } from "next/server"

import { encryptSecret } from "@/lib/crypto"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Edit VPS — cuma Owner. Semua field opsional (partial update); string kosong pada field
 *  nullable (sshPassword, sshPrivateKey, backupCheckPath, coolifyApiUrl, coolifyApiToken)
 *  dianggap "kosongkan field ini". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa edit VPS" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body.host === "string" && body.host.trim()) data.host = body.host.trim()
  if (typeof body.sshUser === "string" && body.sshUser.trim()) data.sshUser = body.sshUser.trim()
  if (body.sshPort !== undefined && Number.isFinite(Number(body.sshPort)) && Number(body.sshPort) > 0) {
    data.sshPort = Number(body.sshPort)
  }
  if (typeof body.sshPassword === "string") data.sshPassword = body.sshPassword.trim() ? encryptSecret(body.sshPassword.trim()) : null
  if (typeof body.sshPrivateKey === "string") {
    data.sshPrivateKey = body.sshPrivateKey.trim() ? encryptSecret(body.sshPrivateKey.trim()) : null
  }
  if (typeof body.diskPath === "string" && body.diskPath.trim()) data.diskPath = body.diskPath.trim()
  if (typeof body.backupCheckPath === "string") data.backupCheckPath = body.backupCheckPath.trim() || null
  if (typeof body.proxyContainerName === "string" && body.proxyContainerName.trim()) {
    data.proxyContainerName = body.proxyContainerName.trim()
  }
  if (typeof body.coolifyApiUrl === "string") data.coolifyApiUrl = body.coolifyApiUrl.trim() || null
  if (typeof body.coolifyApiToken === "string") {
    data.coolifyApiToken = body.coolifyApiToken.trim() ? encryptSecret(body.coolifyApiToken.trim()) : null
  }

  const updated = await prisma.vpsServer.update({ where: { id }, data, select: { id: true } }).catch(() => null)
  if (!updated) return NextResponse.json({ error: "VPS tidak ditemukan" }, { status: 404 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa hapus VPS" }, { status: 403 })

  const { id } = await params
  await prisma.vpsServer.delete({ where: { id } }).catch(() => null)

  return NextResponse.json({ ok: true })
}
