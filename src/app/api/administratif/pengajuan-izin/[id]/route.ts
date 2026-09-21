import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const existing = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Pengajuan izin tidak ditemukan" }, { status: 404 })

  await prisma.leaveRequest.delete({ where: { id } })
  await logAudit({ actorUserId: user.id, action: "administratif.pengajuan-izin.delete", entityType: "leave_request", entityId: id, before: existing })

  return NextResponse.json({ ok: true })
}
