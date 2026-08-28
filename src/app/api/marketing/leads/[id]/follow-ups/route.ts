import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** POST /api/marketing/leads/[id]/follow-ups — jadwalkan follow up (PIC/SPV/Manager).
 *  `assignedUserId` default ke PIC lead (assignment aktif), fallback ke user yang membuat. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  if (!(await canActOnLead(user, id))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  const body = (await request.json().catch(() => null)) as
    | { scheduledAt?: unknown; purpose?: unknown; note?: unknown; assignedUserId?: unknown }
    | null
  const scheduledAtRaw = typeof body?.scheduledAt === "string" ? body.scheduledAt : ""
  const purpose = typeof body?.purpose === "string" ? body.purpose.trim() : ""
  const note = typeof body?.note === "string" ? body.note.trim() || null : null
  if (!scheduledAtRaw) return NextResponse.json({ error: "Tanggal follow up wajib diisi" }, { status: 400 })
  if (!purpose) return NextResponse.json({ error: "Tujuan follow up wajib diisi" }, { status: 400 })
  const scheduledAt = new Date(scheduledAtRaw)
  if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Tanggal tidak valid" }, { status: 400 })

  let assignedUserId = typeof body?.assignedUserId === "string" && body.assignedUserId ? body.assignedUserId : null
  if (!assignedUserId) {
    const pic = await prisma.leadAssignment.findFirst({
      where: { leadId: id, isActive: true },
      select: { assignedUserId: true },
    })
    assignedUserId = pic?.assignedUserId ?? user.id
  }

  const followUp = await prisma.leadFollowUp.create({
    data: { leadId: id, assignedUserId, createdByUserId: user.id, scheduledAt, purpose, note, status: "OPEN" },
  })

  await logAudit({
    actorUserId: user.id,
    action: "marketing.followup.create",
    entityType: "lead",
    entityId: id,
    after: { followUpId: followUp.id, scheduledAt: scheduledAt.toISOString(), assignedUserId },
  })

  return NextResponse.json({ followUp: { id: followUp.id } }, { status: 201 })
}
