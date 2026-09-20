import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** undefined = field tidak dikirim (jangan diubah), null = dikosongkan, Date = diisi. */
function parseDateField(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || (typeof value === "string" && !value.trim())) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Edit field manual Application (name, domain, git, backupLocation, notes, lastBackupAt,
 *  domainExpiresAt sebagai override) — cuma Owner. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa edit aplikasi" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body.domain === "string") data.domain = body.domain.trim() || null
  if (typeof body.gitRepository === "string") data.gitRepository = body.gitRepository.trim() || null
  if (typeof body.gitBranch === "string") data.gitBranch = body.gitBranch.trim() || null
  if (typeof body.backupLocation === "string") data.backupLocation = body.backupLocation.trim() || null
  if (typeof body.activityQuery === "string") data.activityQuery = body.activityQuery.trim() || null
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null

  const lastBackupAt = parseDateField(body.lastBackupAt)
  if (lastBackupAt !== undefined) data.lastBackupAt = lastBackupAt
  const domainExpiresAt = parseDateField(body.domainExpiresAt)
  if (domainExpiresAt !== undefined) data.domainExpiresAt = domainExpiresAt

  const updated = await prisma.application.update({ where: { id }, data, select: { id: true } }).catch(() => null)
  if (!updated) return NextResponse.json({ error: "Aplikasi tidak ditemukan" }, { status: 404 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "sysadmin") return NextResponse.json({ error: "Cuma Owner/Sys Administrator yang bisa hapus aplikasi" }, { status: 403 })

  const { id } = await params
  await prisma.application.delete({ where: { id } }).catch(() => null)

  return NextResponse.json({ ok: true })
}
