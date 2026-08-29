import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/** GET /api/marketing/meta — data pendukung dropdown/filter modul Marketing:
 *  segment aktif, sumber lead aktif, alasan LOST, dan daftar user yang punya akses modul
 *  Marketing (buat filter PIC / assignee). Ringan, aman di-cache pendek di client. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const [segments, sources, lostReasons, users, activityTypes, followUpResultTypes, buyingPowerTiers] = await Promise.all([
    prisma.segment.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.leadSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.leadLostReason.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { isActive: true, OR: [{ role: "owner" }, { modules: { has: "marketing" } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.leadActivityType.findMany({
      where: { isActive: true },
      orderBy: { stageRank: "asc" },
      select: { id: true, code: true, name: true, stageRank: true },
    }),
    prisma.leadFollowUpResultType.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, isPositive: true },
    }),
    prisma.leadBuyingPowerTier.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ])

  return NextResponse.json({ segments, sources, lostReasons, users, activityTypes, followUpResultTypes, buyingPowerTiers })
}
