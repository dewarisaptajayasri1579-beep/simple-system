import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** PATCH — { name?, description?, sortOrder?, normalizedScore?, priorityScoreEffect?, isActive? }.
 *  `priorityScoreEffect` langsung jadi modifier flat di Priority Engine (lihat priority.ts).
 *  DELETE — hanya kalau 0 lead pakai. MANAGER/owner. */
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
  if ("description" in (body ?? {})) data.description = typeof body?.description === "string" ? body.description.trim() || null : null
  if (Number.isFinite(Number(body?.sortOrder))) data.sortOrder = Math.trunc(Number(body!.sortOrder))
  if (Number.isFinite(Number(body?.normalizedScore))) {
    data.normalizedScore = Math.max(0, Math.min(100, Math.trunc(Number(body!.normalizedScore))))
  }
  if (Number.isFinite(Number(body?.priorityScoreEffect))) data.priorityScoreEffect = Math.trunc(Number(body!.priorityScoreEffect))
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })
  await prisma.leadBuyingPowerTier.update({ where: { id }, data })
  await logAudit({ actorUserId: user.id, action: "marketing.buyingpowertier.update", entityType: "lead_buying_power_tier", entityId: id, after: data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }
  const { id } = await params
  const used = await prisma.lead.count({ where: { buyingPowerTierId: id } })
  if (used > 0) return NextResponse.json({ error: `Dipakai ${used} lead — nonaktifkan saja.` }, { status: 400 })
  await prisma.leadBuyingPowerTier.delete({ where: { id } })
  await logAudit({ actorUserId: user.id, action: "marketing.buyingpowertier.delete", entityType: "lead_buying_power_tier", entityId: id })
  return NextResponse.json({ ok: true })
}
