import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — semua hasil follow up (untuk halaman Master Data). Edit lewat PATCH [id]. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const [resultTypes, role] = await Promise.all([
    prisma.leadFollowUpResultType.findMany({ orderBy: { name: "asc" } }),
    resolveMarketingRole(user.id, user.role),
  ])
  return NextResponse.json({ resultTypes, canEdit: role === "MANAGER" })
}
