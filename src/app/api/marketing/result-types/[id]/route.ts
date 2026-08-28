import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** PATCH — edit `name`, `priorityScoreEffect`, `temperatureSignalScore`, `isPositive`, `isActive`
 *  hasil follow up. `code` tidak bisa diubah. MANAGER/owner. `priorityScoreEffect` langsung
 *  memengaruhi komponen "Hasil Follow Up" di Priority Engine. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }
  const { id } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const data: Record<string, unknown> = {}
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (Number.isFinite(Number(body?.priorityScoreEffect))) data.priorityScoreEffect = Number(body!.priorityScoreEffect)
  if (Number.isFinite(Number(body?.temperatureSignalScore))) data.temperatureSignalScore = Number(body!.temperatureSignalScore)
  if (typeof body?.isPositive === "boolean") data.isPositive = body.isPositive
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })
  await prisma.leadFollowUpResultType.update({ where: { id }, data })
  await logAudit({ actorUserId: user.id, action: "marketing.resulttype.update", entityType: "lead_follow_up_result_type", entityId: id, after: data })
  return NextResponse.json({ ok: true })
}
