import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { canActOnLead, resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/**
 * GET  — daftar catatan internal lead (terbaru dulu, maks 50). Role SALES cuma boleh lihat
 *        lead yang dia PIC-nya (404 kalau bukan) — sama seperti leads/[id]/route.ts.
 * POST — tambah catatan bebas teks, dicap waktu otomatis. Wajib PIC / SPV / Manager
 *        (`canActOnLead`) → 403 kalau bukan. Beda dari LeadActivity: tidak ada efek samping
 *        (tidak geser stage, tidak recalc priority, tidak auto-jadwal follow up).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const marketingRole = await resolveMarketingRole(user.id, user.role)
  if (marketingRole === "SALES") {
    const assigned = await prisma.leadAssignment.findFirst({
      where: { leadId: id, assignedUserId: user.id, isActive: true },
      select: { id: true },
    })
    if (!assigned) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  }

  const notes = await prisma.leadNote.findMany({
    where: { leadId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, body: true, createdAt: true, authorUser: { select: { id: true, name: true } } },
  })

  return NextResponse.json({
    notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), author: n.authorUser })),
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  if (!(await canActOnLead(user, id))) {
    return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { body?: unknown } | null
  const text = typeof body?.body === "string" ? body.body.trim() : ""
  if (!text) return NextResponse.json({ error: "Catatan tidak boleh kosong" }, { status: 400 })

  const note = await prisma.leadNote.create({
    data: { leadId: id, authorUserId: user.id, body: text },
    select: { id: true, body: true, createdAt: true, authorUser: { select: { id: true, name: true } } },
  })

  return NextResponse.json(
    { note: { id: note.id, body: note.body, createdAt: note.createdAt.toISOString(), author: note.authorUser } },
    { status: 201 },
  )
}
