import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const existing = await prisma.employee.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const data: Record<string, unknown> = {}
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.position === "string") data.position = body.position.trim() || null
  if (["AKTIF", "NONAKTIF", "KONTRAK", "TETAP"].includes(body?.status)) data.status = body.status
  if (typeof body?.joinDate === "string") data.joinDate = body.joinDate ? new Date(body.joinDate) : null
  if (typeof body?.phone === "string") data.phone = body.phone.trim() || null
  if (typeof body?.email === "string") data.email = body.email.trim() || null
  if (typeof body?.notes === "string") data.notes = body.notes.trim() || null

  const employee = await prisma.employee.update({ where: { id }, data })
  await logAudit({ actorUserId: user.id, action: "administratif.karyawan.update", entityType: "employee", entityId: id, before: existing, after: employee })

  return NextResponse.json({ employee })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const existing = await prisma.employee.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })

  await prisma.employee.delete({ where: { id } })
  await logAudit({ actorUserId: user.id, action: "administratif.karyawan.delete", entityType: "employee", entityId: id, before: existing })

  return NextResponse.json({ ok: true })
}
