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
  const existing = await prisma.correspondenceLog.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Surat tidak ditemukan" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const data: Record<string, unknown> = {}
  if (typeof body?.number === "string" && body.number.trim()) data.number = body.number.trim()
  if (body?.direction === "MASUK" || body?.direction === "KELUAR") data.direction = body.direction
  if (typeof body?.subject === "string" && body.subject.trim()) data.subject = body.subject.trim()
  if (typeof body?.party === "string" && body.party.trim()) data.party = body.party.trim()
  if (typeof body?.date === "string" && body.date) data.date = new Date(body.date)
  if (typeof body?.notes === "string") data.notes = body.notes.trim() || null

  const letter = await prisma.correspondenceLog.update({ where: { id }, data })
  await logAudit({ actorUserId: user.id, action: "administratif.surat.update", entityType: "correspondence_log", entityId: id, before: existing, after: letter })

  return NextResponse.json({ letter })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const existing = await prisma.correspondenceLog.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Surat tidak ditemukan" }, { status: 404 })

  await prisma.correspondenceLog.delete({ where: { id } })
  await logAudit({ actorUserId: user.id, action: "administratif.surat.delete", entityType: "correspondence_log", entityId: id, before: existing })

  return NextResponse.json({ ok: true })
}
