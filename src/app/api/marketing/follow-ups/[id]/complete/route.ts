import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { FOLLOW_UP_GRACE_MS } from "@/lib/marketing/follow-up"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadPriority } from "@/lib/marketing/priority"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/marketing/follow-ups/[id]/complete — selesaikan follow up (PIC/SPV/Manager).
 * Body: { resultTypeId, resultNote?, next?: { scheduledAt, purpose, note? } }
 * Wajib resultTypeId. `next` opsional → langsung buat follow up lanjutan + link nextFollowUpId.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const fu = await prisma.leadFollowUp.findUnique({
    where: { id },
    select: { id: true, leadId: true, status: true, scheduledAt: true, assignedUserId: true },
  })
  if (!fu) return NextResponse.json({ error: "Follow up tidak ditemukan" }, { status: 404 })
  if (fu.status !== "OPEN") return NextResponse.json({ error: "Follow up ini sudah selesai / dibatalkan" }, { status: 400 })
  if (!(await canActOnLead(user, fu.leadId))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  const body = (await request.json().catch(() => null)) as
    | { resultTypeId?: unknown; resultNote?: unknown; next?: { scheduledAt?: unknown; purpose?: unknown; note?: unknown } }
    | null
  const resultTypeId = typeof body?.resultTypeId === "string" ? body.resultTypeId : ""
  if (!resultTypeId) return NextResponse.json({ error: "Pilih hasil follow up dulu" }, { status: 400 })
  const resultType = await prisma.leadFollowUpResultType.findUnique({ where: { id: resultTypeId }, select: { id: true } })
  if (!resultType) return NextResponse.json({ error: "Hasil follow up tidak valid" }, { status: 400 })
  const resultNote = typeof body?.resultNote === "string" ? body.resultNote.trim() || null : null

  const now = new Date()
  const isOnTime = now.getTime() <= fu.scheduledAt.getTime() + FOLLOW_UP_GRACE_MS

  let nextData: { scheduledAt: Date; purpose: string; note: string | null } | null = null
  const n = body?.next
  if (n && typeof n.scheduledAt === "string" && n.scheduledAt && typeof n.purpose === "string" && n.purpose.trim()) {
    const d = new Date(n.scheduledAt)
    if (!Number.isNaN(d.getTime())) {
      nextData = { scheduledAt: d, purpose: n.purpose.trim(), note: typeof n.note === "string" ? n.note.trim() || null : null }
    }
  }

  const createdNextId = await prisma.$transaction(async (tx) => {
    let nextId: string | null = null
    if (nextData) {
      const created = await tx.leadFollowUp.create({
        data: {
          leadId: fu.leadId,
          assignedUserId: fu.assignedUserId,
          createdByUserId: user.id,
          scheduledAt: nextData.scheduledAt,
          purpose: nextData.purpose,
          note: nextData.note,
          status: "OPEN",
        },
      })
      nextId = created.id
    }
    await tx.leadFollowUp.update({
      where: { id },
      data: { status: "COMPLETED", resultTypeId, resultNote, completedAt: now, isOnTime, nextFollowUpId: nextId },
    })
    await tx.lead.update({ where: { id: fu.leadId }, data: { lastInteractionAt: now } })
    return nextId
  })

  await recalcLeadPriority(fu.leadId)
  await logAudit({
    actorUserId: user.id,
    action: "marketing.followup.complete",
    entityType: "lead",
    entityId: fu.leadId,
    after: { followUpId: id, resultTypeId, isOnTime, nextFollowUpId: createdNextId },
  })

  return NextResponse.json({ ok: true, nextFollowUpId: createdNextId })
}
