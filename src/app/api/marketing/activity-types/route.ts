import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — semua jenis aktivitas (untuk halaman Master Data). Edit lewat PATCH [id]. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const [activityTypes, role] = await Promise.all([
    prisma.leadActivityType.findMany({ orderBy: { stageRank: "asc" } }),
    resolveMarketingRole(user.id, user.role),
  ])
  return NextResponse.json({ activityTypes, canEdit: role === "MANAGER" })
}
