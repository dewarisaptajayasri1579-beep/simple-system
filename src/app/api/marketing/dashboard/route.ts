import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { buildTeamAggregates, startOfMonth } from "@/lib/marketing/analytics"
import { startOfToday } from "@/lib/marketing/follow-up"
import { prisma } from "@/lib/prisma"

/** GET /api/marketing/dashboard — control tower Manager: KPI global, funnel tahap, performa
 *  segmen, performa tim. Terbuka untuk semua anggota tim. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sot = startOfToday()
  const som = startOfMonth()

  const [totalLeads, byTemp, byOutcome, byStage, fuOverdue, fuDoneMonth, fuOnTimeMonth, bySegment, wonBySegment, members, segments] =
    await Promise.all([
      prisma.lead.count(),
      prisma.lead.groupBy({ by: ["temperature"], _count: true }),
      prisma.lead.groupBy({ by: ["outcome"], _count: true }),
      prisma.lead.groupBy({ by: ["currentActivityStage"], where: { outcome: "OPEN" }, _count: true }),
      prisma.leadFollowUp.count({ where: { status: "OPEN", scheduledAt: { lt: sot } } }),
      prisma.leadFollowUp.count({ where: { status: "COMPLETED", completedAt: { gte: som } } }),
      prisma.leadFollowUp.count({ where: { status: "COMPLETED", completedAt: { gte: som }, isOnTime: true } }),
      prisma.lead.groupBy({ by: ["segmentId"], _count: true }),
      prisma.lead.groupBy({ by: ["segmentId"], where: { outcome: "WON" }, _count: true }),
      buildTeamAggregates(),
      prisma.segment.findMany({ select: { id: true, name: true } }),
    ])

  const countOf = (rows: { _count: unknown }[], keyName: string, key: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((rows as any[]).find((r) => r[keyName] === key)?._count ?? 0) as number

  const segName = new Map(segments.map((s) => [s.id, s.name]))
  const wonSeg = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wonBySegment as any[]).map((r) => [r.segmentId ?? "none", typeof r._count === "number" ? r._count : 0]),
  )
  const segmentPerformance = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bySegment as any[])
      .map((r) => ({
        segmentId: r.segmentId,
        name: r.segmentId ? segName.get(r.segmentId) ?? "—" : "Tanpa Segmen",
        leads: typeof r._count === "number" ? r._count : 0,
        won: wonSeg.get(r.segmentId ?? "none") ?? 0,
      }))
      .sort((a, b) => b.leads - a.leads)

  return NextResponse.json({
    kpi: {
      totalLeads,
      cold: countOf(byTemp as never, "temperature", "COLD"),
      warm: countOf(byTemp as never, "temperature", "WARM"),
      hot: countOf(byTemp as never, "temperature", "HOT"),
      open: countOf(byOutcome as never, "outcome", "OPEN"),
      won: countOf(byOutcome as never, "outcome", "WON"),
      lost: countOf(byOutcome as never, "outcome", "LOST"),
      followUpOverdue: fuOverdue,
      followUpOnTimeRate: fuDoneMonth > 0 ? Math.round((fuOnTimeMonth / fuDoneMonth) * 100) : null,
    },
    funnel: [
      { stage: "DISCUSSION", label: "Diskusi", count: countOf(byStage as never, "currentActivityStage", "DISCUSSION") },
      { stage: "ZOOM_DEMO", label: "Zoom/Demo", count: countOf(byStage as never, "currentActivityStage", "ZOOM_DEMO") },
      { stage: "PROPOSAL", label: "Penawaran", count: countOf(byStage as never, "currentActivityStage", "PROPOSAL") },
      { stage: "NEGOTIATION", label: "Negosiasi", count: countOf(byStage as never, "currentActivityStage", "NEGOTIATION") },
    ],
    segmentPerformance,
    team: members,
  })
}
