import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { createNotification } from "@/lib/marketing/notify"
import { canViewMarketing, resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/**
 * "Tandai Prioritas" — SPV/Manager menunjuk lead mana yang harus didahulukan Sales.
 *
 * POST   /api/marketing/leads/[id]/priority-pin  → tandai
 * DELETE /api/marketing/leads/[id]/priority-pin  → lepas tanda
 *
 * Kenapa satu endpoint melakukan 3 hal sekaligus (set PIC + tandai + jadwalkan follow up):
 * Sales (Candra/Ayu) cuma bisa MELIHAT lead yang dia jadi PIC-nya (lihat permissions.ts).
 * Jadi menandai lead yang PIC-nya orang lain itu percuma — tandanya tidak akan pernah muncul di
 * layar mereka. Makanya penetapan PIC dijadikan satu langkah dengan penandaan, bukan dua tombol
 * terpisah yang gampang kelupaan separuhnya.
 *
 * body POST: { note?, assignedUserId?, scheduledAt? }
 *  - `assignedUserId` : kalau diisi & beda dari PIC sekarang, PIC-nya dipindah ke user itu
 *                       (jalur yang sama dengan reassign di assignments/route.ts).
 *  - `scheduledAt`    : kalau diisi, sekalian dibuatkan LeadFollowUp atas nama PIC-nya — supaya
 *                       tugasnya punya jatuh tempo, masuk menu Follow Up, dan wajib diselesaikan
 *                       dengan hasil (kehitung on-time di KPI), bukan cuma jadi badge.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, displayName: true, outcome: true, priorityPinnedAt: true },
  })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })

  const role = await resolveMarketingRole(user.id, user.role)
  if (role !== "MANAGER" && role !== "SPV") {
    return NextResponse.json({ error: "Hanya SPV/Manager yang bisa menandai lead prioritas." }, { status: 403 })
  }
  if (lead.outcome !== "OPEN") {
    return NextResponse.json({ error: "Lead ini sudah keluar funnel — tidak perlu ditandai prioritas." }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as
    | { note?: unknown; assignedUserId?: unknown; scheduledAt?: unknown }
    | null
  const note = typeof body?.note === "string" ? body.note.trim() || null : null
  const wantedPicId = typeof body?.assignedUserId === "string" && body.assignedUserId ? body.assignedUserId : null
  const scheduledAtRaw = typeof body?.scheduledAt === "string" ? body.scheduledAt : ""
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Tanggal follow up tidak valid" }, { status: 400 })
  }

  const activeAssignment = await prisma.leadAssignment.findFirst({
    where: { leadId: id, isActive: true },
    select: { id: true, assignedUserId: true },
  })

  // Validasi user tujuan sebelum masuk transaksi — biar gagalnya bersih, bukan setengah jadi.
  let targetPicId = activeAssignment?.assignedUserId ?? null
  let picChanged = false
  if (wantedPicId && wantedPicId !== activeAssignment?.assignedUserId) {
    const targetUser = await prisma.user.findUnique({
      where: { id: wantedPicId },
      select: { id: true, role: true, modules: true, name: true },
    })
    if (!targetUser || !canViewMarketing(targetUser)) {
      return NextResponse.json({ error: "User tujuan tidak punya akses modul Marketing." }, { status: 400 })
    }
    targetPicId = wantedPicId
    picChanged = true
  }
  if (scheduledAt && !targetPicId) {
    return NextResponse.json({ error: "Pilih PIC dulu — follow up harus ada penanggung jawabnya." }, { status: 400 })
  }

  const pinnedAt = new Date()
  const previousPicId = activeAssignment?.assignedUserId ?? null

  const result = await prisma.$transaction(async (tx) => {
    if (picChanged && targetPicId) {
      await tx.leadAssignment.updateMany({ where: { leadId: id, isActive: true }, data: { isActive: false, endedAt: pinnedAt } })
      await tx.leadAssignment.create({
        data: {
          leadId: id,
          assignedUserId: targetPicId,
          assignedByUserId: user.id,
          assignmentType: "PRIMARY",
          reason: note ? `Ditandai prioritas — ${note}` : "Ditandai prioritas oleh SPV/Manager",
          isActive: true,
        },
      })
    }

    await tx.lead.update({
      where: { id },
      data: { priorityPinnedAt: pinnedAt, priorityPinnedById: user.id, priorityPinNote: note },
    })

    let followUpId: string | null = null
    if (scheduledAt && targetPicId) {
      const followUp = await tx.leadFollowUp.create({
        data: {
          leadId: id,
          assignedUserId: targetPicId,
          createdByUserId: user.id,
          scheduledAt,
          purpose: note || "Prioritas dari SPV",
          status: "OPEN",
          source: "MANUAL",
        },
      })
      followUpId = followUp.id
    }
    return { followUpId }
  })

  // Notifikasi di luar transaksi — createNotification juga mengirim Web Push (best-effort), jangan
  // sampai jaringan lambat menahan transaksi database terbuka.
  if (targetPicId && targetPicId !== user.id) {
    await createNotification({
      userId: targetPicId,
      type: "LEAD_PRIORITY_PINNED",
      title: `Lead prioritas dari ${user.name}: ${lead.displayName}`,
      body: note || (picChanged ? "Kamu jadi PIC & lead ini didahulukan" : "Lead ini didahulukan"),
      entityType: "lead",
      entityId: id,
      deepLink: `/marketing/leads/${id}`,
      dedupeKey: `priority-pin:${id}:${pinnedAt.toISOString()}`,
    })
  }
  if (picChanged && previousPicId && previousPicId !== targetPicId) {
    await createNotification({
      userId: previousPicId,
      type: "LEAD_ASSIGNED",
      title: `Lead pindah PIC: ${lead.displayName}`,
      body: `Dipindahkan ${user.name}${note ? ` — ${note}` : ""}`,
      entityType: "lead",
      entityId: id,
      deepLink: `/marketing/leads/${id}`,
      dedupeKey: `priority-pin-unassign:${id}:${pinnedAt.toISOString()}`,
    })
  }

  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.priority_pin",
    entityType: "lead",
    entityId: id,
    before: { priorityPinnedAt: lead.priorityPinnedAt?.toISOString() ?? null, picUserId: previousPicId },
    after: { priorityPinnedAt: pinnedAt.toISOString(), note, picUserId: targetPicId, followUpId: result.followUpId },
  })

  return NextResponse.json({ ok: true, followUpId: result.followUpId, picUserId: targetPicId })
}

/** Lepas tanda prioritas. PIC & follow up yang sudah terlanjur dibuat SENGAJA tidak ikut dibatalkan
 *  — itu penugasan nyata yang sudah jalan, bukan bagian dari tandanya. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true, priorityPinnedAt: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })

  const role = await resolveMarketingRole(user.id, user.role)
  if (role !== "MANAGER" && role !== "SPV") {
    return NextResponse.json({ error: "Hanya SPV/Manager yang bisa melepas tanda prioritas." }, { status: 403 })
  }

  await prisma.lead.update({
    where: { id },
    data: { priorityPinnedAt: null, priorityPinnedById: null, priorityPinNote: null },
  })
  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.priority_unpin",
    entityType: "lead",
    entityId: id,
    before: { priorityPinnedAt: lead.priorityPinnedAt?.toISOString() ?? null },
    after: { priorityPinnedAt: null },
  })

  return NextResponse.json({ ok: true })
}
