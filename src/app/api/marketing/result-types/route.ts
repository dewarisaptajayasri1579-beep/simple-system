import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — semua hasil follow up (untuk halaman Master Data). Edit lewat PATCH [id]. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const [resultTypes, counts, role] = await Promise.all([
    prisma.leadFollowUpResultType.findMany({ orderBy: { name: "asc" } }),
    prisma.leadFollowUp.groupBy({ by: ["resultTypeId"], where: { resultTypeId: { not: null } }, _count: true }),
    resolveMarketingRole(user.id, user.role),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const used = new Map((counts as any[]).map((c) => [c.resultTypeId, c._count as number]))
  return NextResponse.json({
    resultTypes: resultTypes.map((r) => ({ ...r, usageCount: used.get(r.id) ?? 0 })),
    canEdit: role === "MANAGER",
  })
}
