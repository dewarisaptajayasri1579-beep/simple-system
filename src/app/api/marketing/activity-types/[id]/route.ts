import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** PATCH — edit `name`, `stageRank`, `score`, `isActive` jenis aktivitas. `code` tidak bisa diubah
 *  (dipakai logika geser tahapan di activities route). MANAGER/owner. */
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
  if (Number.isFinite(Number(body?.stageRank))) data.stageRank = Number(body!.stageRank)
  if (Number.isFinite(Number(body?.score))) data.score = Number(body!.score)
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })
  await prisma.leadActivityType.update({ where: { id }, data })
  await logAudit({ actorUserId: user.id, action: "marketing.activitytype.update", entityType: "lead_activity_type", entityId: id, after: data })
  return NextResponse.json({ ok: true })
}
