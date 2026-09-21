import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama jenis izin wajib diisi" }, { status: 400 })

  const leaveType = await prisma.leaveType.update({ where: { id }, data: { name } })
  return NextResponse.json({ leaveType })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const inUse = await prisma.leaveRequest.count({ where: { leaveTypeId: id } })
  if (inUse > 0) return NextResponse.json({ error: "Jenis izin ini masih dipakai di pengajuan izin" }, { status: 400 })

  await prisma.leaveType.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
