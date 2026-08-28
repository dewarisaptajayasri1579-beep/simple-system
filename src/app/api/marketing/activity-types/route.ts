import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — semua jenis aktivitas (untuk halaman Master Data). Edit lewat PATCH [id]. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const [activityTypes, counts, role] = await Promise.all([
    prisma.leadActivityType.findMany({ orderBy: { stageRank: "asc" } }),
    prisma.leadActivity.groupBy({ by: ["activityTypeId"], _count: true }),
    resolveMarketingRole(user.id, user.role),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const used = new Map((counts as any[]).map((c) => [c.activityTypeId, c._count as number]))
  return NextResponse.json({
    activityTypes: activityTypes.map((r) => ({ ...r, usageCount: used.get(r.id) ?? 0 })),
    canEdit: role === "MANAGER",
  })
}
