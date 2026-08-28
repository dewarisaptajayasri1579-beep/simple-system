import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadPriority } from "@/lib/marketing/priority"
import { prisma } from "@/lib/prisma"

/** Rank tahap aktivitas — dipakai untuk menggeser `Lead.currentActivityStage` maju (tidak
 *  pernah mundur otomatis). Sinkron dengan LeadActivityType.stageRank hasil seed. */
const STAGE_RANK: Record<string, number> = { NONE: 0, DISCUSSION: 1, ZOOM_DEMO: 2, PROPOSAL: 3, NEGOTIATION: 4 }

/** POST /api/marketing/leads/[id]/activities — catat aktivitas (PIC/SPV/Manager).
 *  Bisa menggeser activity stage + trigger recalc priority. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id }, select: { currentActivityStage: true, lastInteractionAt: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  if (!(await canActOnLead(user, id))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  const body = (await request.json().catch(() => null)) as
    | { activityTypeId?: unknown; occurredAt?: unknown; note?: unknown; result?: unknown }
    | null
  const activityTypeId = typeof body?.activityTypeId === "string" ? body.activityTypeId : ""
  if (!activityTypeId) return NextResponse.json({ error: "Jenis aktivitas wajib dipilih" }, { status: 400 })

  const activityType = await prisma.leadActivityType.findUnique({ where: { id: activityTypeId }, select: { code: true } })
  if (!activityType) return NextResponse.json({ error: "Jenis aktivitas tidak valid" }, { status: 400 })

  const occurredAt = typeof body?.occurredAt === "string" && body.occurredAt ? new Date(body.occurredAt) : new Date()
  const note = typeof body?.note === "string" ? body.note.trim() || null : null
  const result = typeof body?.result === "string" ? body.result.trim() || null : null

  const activity = await prisma.leadActivity.create({
    data: { leadId: id, activityTypeId, actorUserId: user.id, occurredAt, note, result, source: "MANUAL" },
  })

  // geser stage maju kalau aktivitas ini tahap yang lebih tinggi
  const newRank = STAGE_RANK[activityType.code]
  const curRank = STAGE_RANK[lead.currentActivityStage] ?? 0
  const leadData: Record<string, unknown> = {}
  if (newRank != null && newRank > curRank) leadData.currentActivityStage = activityType.code
  if (!lead.lastInteractionAt || occurredAt > lead.lastInteractionAt) leadData.lastInteractionAt = occurredAt
  if (Object.keys(leadData).length > 0) await prisma.lead.update({ where: { id }, data: leadData })

  await recalcLeadPriority(id)
  await logAudit({
    actorUserId: user.id,
    action: "marketing.activity.create",
    entityType: "lead",
    entityId: id,
    after: { activityTypeId, code: activityType.code, stageAdvancedTo: leadData.currentActivityStage ?? null },
  })

  return NextResponse.json({ activity: { id: activity.id } }, { status: 201 })
}
