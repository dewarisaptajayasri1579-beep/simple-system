import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { prisma } from "@/lib/prisma"

/**
 * "Geser ke Lead Potensial" — hasil pemilahan manual Tim atas daftar lead semua segmen.
 *
 * POST   /api/marketing/leads/[id]/potential  → tandai potensial   (body: { note? })
 * DELETE /api/marketing/leads/[id]/potential  → lepas dari Potensial
 *
 * Kenapa SEMUA anggota Tim boleh (tidak pakai `canActOnLead` seperti temperatur/outcome/follow
 * up): ini pekerjaan penyaringan massal — Tim membuka daftar lead, memilah satu per satu, geser
 * yang kelihatan potensial. Kalau dibatasi PIC, satu orang yang ditugasi memilah bakal kena 403
 * di hampir semua baris dan pekerjaannya tidak bisa jalan. Penggeseran ini juga TIDAK mengubah
 * apa pun yang jadi kewenangan PIC (temperatur, outcome, jadwal, PIC-nya sendiri) — cuma
 * menambah lead itu ke satu daftar kurasi. Siapa & kapan tetap tercatat di `AuditLog` dan
 * ditampilkan di menu Lead Potensial, jadi salah geser kelihatan dan bisa dibalikkan.
 *
 * Catatan visibilitas: role SALES tetap cuma melihat lead miliknya (di-enforce di
 * GET /api/marketing/leads), jadi Sales praktis cuma bisa memilah lead sendiri.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, potentialAt: true, potentialNote: true },
  })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })

  const body = (await request.json().catch(() => null)) as { note?: unknown } | null
  const note = typeof body?.note === "string" ? body.note.trim() || null : null

  // Geser ulang lead yang sudah potensial = update catatannya, tanggal gesernya TIDAK direset —
  // urutan di menu Lead Potensial pakai tanggal itu, jadi mengeditnya catatan saja tidak boleh
  // bikin lead lama naik lagi ke paling atas seolah baru dipilah.
  const potentialAt = lead.potentialAt ?? new Date()
  await prisma.lead.update({
    where: { id },
    data: { potentialAt, potentialById: lead.potentialAt ? undefined : user.id, potentialNote: note },
  })

  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.potential",
    entityType: "lead",
    entityId: id,
    before: { potentialAt: lead.potentialAt?.toISOString() ?? null, potentialNote: lead.potentialNote ?? null },
    after: { potentialAt: potentialAt.toISOString(), potentialNote: note },
  })

  return NextResponse.json({ ok: true, potentialAt: potentialAt.toISOString() })
}

/** Lepas dari daftar Lead Potensial. Lead-nya sendiri tidak disentuh — cuma tandanya dilepas. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, potentialAt: true, potentialNote: true },
  })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })

  await prisma.lead.update({
    where: { id },
    data: { potentialAt: null, potentialById: null, potentialNote: null },
  })

  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.potential_remove",
    entityType: "lead",
    entityId: id,
    before: { potentialAt: lead.potentialAt?.toISOString() ?? null, potentialNote: lead.potentialNote ?? null },
    after: { potentialAt: null },
  })

  return NextResponse.json({ ok: true })
}
