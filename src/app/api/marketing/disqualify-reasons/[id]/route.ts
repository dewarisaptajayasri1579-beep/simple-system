import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** PATCH — { name?, isActive?, sortOrder? }. DELETE — hanya kalau 0 lead pakai. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { name?: unknown; isActive?: unknown; sortOrder?: unknown } | null
  const data: Record<string, unknown> = {}
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive
  if (typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)) data.sortOrder = Math.round(body.sortOrder)
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })
  await prisma.leadDisqualifyReason.update({ where: { id }, data })
  await logAudit({ actorUserId: user.id, action: "marketing.disqualifyreason.update", entityType: "lead_disqualify_reason", entityId: id, after: data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }
  const { id } = await params
  const used = await prisma.lead.count({ where: { disqualifyReasonId: id } })
  if (used > 0) return NextResponse.json({ error: `Dipakai ${used} lead — nonaktifkan saja.` }, { status: 400 })
  await prisma.leadDisqualifyReason.delete({ where: { id } })
  await logAudit({ actorUserId: user.id, action: "marketing.disqualifyreason.delete", entityType: "lead_disqualify_reason", entityId: id })
  return NextResponse.json({ ok: true })
}
