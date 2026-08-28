import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/** GET /api/marketing/activities?actorUserId=&leadId=&limit= — log aktivitas (untuk halaman
 *  detail sales / lead). Terbuka untuk semua anggota tim. */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50))
  const where: Record<string, unknown> = { isVoid: false }
  if (sp.get("actorUserId")) where.actorUserId = sp.get("actorUserId")
  if (sp.get("leadId")) where.leadId = sp.get("leadId")

  const rows = await prisma.leadActivity.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: {
      id: true,
      occurredAt: true,
      note: true,
      result: true,
      activityType: { select: { name: true } },
      actorUser: { select: { name: true } },
      lead: { select: { id: true, displayName: true } },
    },
  })

  return NextResponse.json({
    activities: rows.map((a) => ({
      id: a.id,
      occurredAt: a.occurredAt.toISOString(),
      note: a.note,
      result: a.result,
      typeName: a.activityType.name,
      actorName: a.actorUser.name,
      lead: a.lead,
    })),
  })
}
