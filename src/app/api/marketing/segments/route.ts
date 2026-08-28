import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — semua segmen (termasuk nonaktif) + jumlah lead per segmen. POST — buat segmen
 *  (MANAGER/owner). `code` di-uppercase & unik. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const [segments, counts, role] = await Promise.all([
    prisma.segment.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.lead.groupBy({ by: ["segmentId"], _count: true }),
    resolveMarketingRole(user.id, user.role),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadCount = new Map((counts as any[]).map((c) => [c.segmentId, typeof c._count === "number" ? c._count : 0]))

  return NextResponse.json({
    segments: segments.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      description: s.description,
      isActive: s.isActive,
      defaultFollowUpHours: s.defaultFollowUpHours,
      aiContext: s.aiContext,
      leadCount: leadCount.get(s.id) ?? 0,
    })),
    canEdit: role === "MANAGER",
  })
}

export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { code?: unknown; name?: unknown; description?: unknown; aiContext?: unknown; defaultFollowUpHours?: unknown }
    | null
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!code || !name) return NextResponse.json({ error: "Kode & nama wajib diisi" }, { status: 400 })
  if (await prisma.segment.findUnique({ where: { code } })) {
    return NextResponse.json({ error: `Kode "${code}" sudah dipakai` }, { status: 400 })
  }

  const seg = await prisma.segment.create({
    data: {
      code,
      name,
      description: typeof body?.description === "string" ? body.description.trim() || null : null,
      aiContext: typeof body?.aiContext === "string" ? body.aiContext.trim() || null : null,
      defaultFollowUpHours:
        body?.defaultFollowUpHours != null && Number.isFinite(Number(body.defaultFollowUpHours))
          ? Number(body.defaultFollowUpHours)
          : null,
    },
  })
  await logAudit({ actorUserId: user.id, action: "marketing.segment.create", entityType: "segment", entityId: seg.id, after: { code, name } })
  return NextResponse.json({ segment: { id: seg.id } }, { status: 201 })
}
