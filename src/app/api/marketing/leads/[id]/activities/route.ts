import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { ensureAutoFollowUp } from "@/lib/marketing/auto-follow-up"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { advanceStage } from "@/lib/marketing/rules"
import { prisma } from "@/lib/prisma"

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
    | { activityTypeId?: unknown; occurredAt?: unknown; note?: unknown; result?: unknown; attachmentUrl?: unknown }
    | null
  const activityTypeId = typeof body?.activityTypeId === "string" ? body.activityTypeId : ""
  if (!activityTypeId) return NextResponse.json({ error: "Jenis aktivitas wajib dipilih" }, { status: 400 })

  const activityType = await prisma.leadActivityType.findUnique({ where: { id: activityTypeId }, select: { code: true } })
  if (!activityType) return NextResponse.json({ error: "Jenis aktivitas tidak valid" }, { status: 400 })

  const occurredAt = typeof body?.occurredAt === "string" && body.occurredAt ? new Date(body.occurredAt) : new Date()
  const note = typeof body?.note === "string" ? body.note.trim() || null : null
  const result = typeof body?.result === "string" ? body.result.trim() || null : null
  // Diisi dari POST .../recordings kalau aktivitas ini dibuat dari alur "Rekam Panggilan"
  // (lihat LeadDetailClient.tsx) — nullable/opsional, aktivitas manual biasa tidak punya ini.
  const attachmentUrl = typeof body?.attachmentUrl === "string" && body.attachmentUrl ? body.attachmentUrl : null

  const activity = await prisma.leadActivity.create({
    data: { leadId: id, activityTypeId, actorUserId: user.id, occurredAt, note, result, attachmentUrl, source: "MANUAL" },
  })

  // geser stage maju kalau aktivitas ini tahap yang lebih tinggi (docs/06 §7)
  const nextStage = advanceStage(lead.currentActivityStage, activityType.code)
  const leadData: Record<string, unknown> = {}
  if (nextStage !== lead.currentActivityStage) leadData.currentActivityStage = nextStage
  if (!lead.lastInteractionAt || occurredAt > lead.lastInteractionAt) leadData.lastInteractionAt = occurredAt
  if (Object.keys(leadData).length > 0) await prisma.lead.update({ where: { id }, data: leadData })

  await recalcLeadDerived(id).catch(() => {})

  // Auto-jadwal follow up berikutnya kalau lead belum punya yang OPEN.
  await ensureAutoFollowUp(id, {
    from: occurredAt,
    purpose: `Tindak lanjut setelah: ${activityType.code}`,
    reason: "setelah aktivitas dicatat",
    createdByUserId: user.id,
  }).catch(() => null)

  await logAudit({
    actorUserId: user.id,
    action: "marketing.activity.create",
    entityType: "lead",
    entityId: id,
    after: { activityTypeId, code: activityType.code, stageAdvancedTo: leadData.currentActivityStage ?? null },
  })

  return NextResponse.json({ activity: { id: activity.id } }, { status: 201 })
}
