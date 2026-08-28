import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { parseKeywordInput } from "@/lib/marketing/segment-rules"
import { prisma } from "@/lib/prisma"

/** PATCH — edit segmen (name/description/aiContext/defaultFollowUpHours/isActive). Kode TIDAK bisa
 *  diubah (dipakai AI + histori). DELETE — hanya kalau 0 lead pakai; selain itu pakai isActive:false. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.segment.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Segmen tidak ditemukan" }, { status: 404 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if ("description" in body) data.description = typeof body.description === "string" ? body.description.trim() || null : null
  if ("aiContext" in body) data.aiContext = typeof body.aiContext === "string" ? body.aiContext.trim() || null : null
  if ("defaultFollowUpHours" in body)
    data.defaultFollowUpHours = Number.isFinite(Number(body.defaultFollowUpHours)) ? Number(body.defaultFollowUpHours) : null
  if ("keywords" in body) data.keywords = parseKeywordInput(body.keywords)
  if ("keywordPriority" in body)
    data.keywordPriority = Number.isFinite(Number(body.keywordPriority)) ? Number(body.keywordPriority) : 0
  if (typeof body.isActive === "boolean") data.isActive = body.isActive
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })

  await prisma.segment.update({ where: { id }, data })
  await logAudit({ actorUserId: user.id, action: "marketing.segment.update", entityType: "segment", entityId: id, before: existing, after: data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }

  const { id } = await params
  const used = await prisma.lead.count({ where: { segmentId: id } })
  if (used > 0) {
    return NextResponse.json(
      { error: `Segmen dipakai ${used} lead — nonaktifkan saja (toggle Aktif), jangan dihapus.` },
      { status: 400 },
    )
  }
  await prisma.segment.delete({ where: { id } })
  await logAudit({ actorUserId: user.id, action: "marketing.segment.delete", entityType: "segment", entityId: id })
  return NextResponse.json({ ok: true })
}
