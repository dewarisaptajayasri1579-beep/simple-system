import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** POST /api/marketing/follow-ups/[id]/cancel — batalkan follow up OPEN (PIC/SPV/Manager). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const fu = await prisma.leadFollowUp.findUnique({ where: { id }, select: { leadId: true, status: true } })
  if (!fu) return NextResponse.json({ error: "Follow up tidak ditemukan" }, { status: 404 })
  if (fu.status !== "OPEN") return NextResponse.json({ error: "Follow up ini bukan status OPEN" }, { status: 400 })
  if (!(await canActOnLead(user, fu.leadId))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null
  const reason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  await prisma.leadFollowUp.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), resultNote: reason },
  })
  await logAudit({
    actorUserId: user.id,
    action: "marketing.followup.cancel",
    entityType: "lead",
    entityId: fu.leadId,
    after: { followUpId: id, reason },
  })

  return NextResponse.json({ ok: true })
}
