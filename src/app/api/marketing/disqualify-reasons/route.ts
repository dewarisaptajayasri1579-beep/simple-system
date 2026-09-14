import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** Master "Alasan Bukan Prospek" (outcome NOT_RELEVANT) — kembaran lost-reasons, sengaja
 *  endpoint & tabel terpisah supaya alasan lead nyasar tidak tercampur dengan alasan kalah
 *  bersaing di laporan (lihat catatan di model LeadDisqualifyReason).
 *  GET — semua (termasuk nonaktif). POST — buat baru (MANAGER/owner). */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const [rows, counts, role] = await Promise.all([
    prisma.leadDisqualifyReason.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.lead.groupBy({ by: ["disqualifyReasonId"], where: { disqualifyReasonId: { not: null } }, _count: true }),
    resolveMarketingRole(user.id, user.role),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const used = new Map((counts as any[]).map((c) => [c.disqualifyReasonId, c._count as number]))
  return NextResponse.json({
    disqualifyReasons: rows.map((r) => ({ ...r, usageCount: used.get(r.id) ?? 0 })),
    canEdit: role === "MANAGER",
  })
}

export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown; name?: unknown } | null
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!code || !name) return NextResponse.json({ error: "Kode & nama wajib" }, { status: 400 })
  if (await prisma.leadDisqualifyReason.findUnique({ where: { code } })) {
    return NextResponse.json({ error: `Kode "${code}" sudah dipakai` }, { status: 400 })
  }
  const r = await prisma.leadDisqualifyReason.create({ data: { code, name } })
  await logAudit({ actorUserId: user.id, action: "marketing.disqualifyreason.create", entityType: "lead_disqualify_reason", entityId: r.id, after: { code, name } })
  return NextResponse.json({ disqualifyReason: { id: r.id } }, { status: 201 })
}
