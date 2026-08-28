import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { buildTeamAggregates, startOfMonth } from "@/lib/marketing/analytics"
import { startOfToday } from "@/lib/marketing/follow-up"
import { avgResponseTime, conversionRates } from "@/lib/marketing/kpi"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/marketing/dashboard — control tower Manager. Filter opsional: `from`/`to` (createdAt
 * lead), `segmentId`. KPI global + funnel + performa segmen (distribusi temperatur, won/lost,
 * konversi) + conversion rates + avg response time + performa tim.
 */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const from = sp.get("from") ? new Date(sp.get("from")!) : null
  const to = sp.get("to") ? new Date(sp.get("to")!) : null
  const segmentId = sp.get("segmentId") || null

  const leadWhere: Prisma.LeadWhereInput = {}
  if (from && !Number.isNaN(from.getTime())) leadWhere.createdAt = { ...(leadWhere.createdAt as object), gte: from }
  if (to && !Number.isNaN(to.getTime())) leadWhere.createdAt = { ...(leadWhere.createdAt as object), lte: to }
  if (segmentId) leadWhere.segmentId = segmentId

  const sot = startOfToday()
  const som = startOfMonth()

  const [
    totalLeads,
    byTemp,
    byOutcome,
    byStage,
    fuOverdue,
    fuDoneMonth,
    fuOnTimeMonth,
    bySegment,
    wonBySegment,
    lostBySegment,
    hotBySegment,
    members,
    segments,
    conv,
    resp,
  ] = await Promise.all([
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.groupBy({ by: ["temperature"], where: leadWhere, _count: true }),
    prisma.lead.groupBy({ by: ["outcome"], where: leadWhere, _count: true }),
    prisma.lead.groupBy({ by: ["currentActivityStage"], where: { ...leadWhere, outcome: "OPEN" }, _count: true }),
    prisma.leadFollowUp.count({ where: { status: "OPEN", scheduledAt: { lt: sot } } }),
    prisma.leadFollowUp.count({ where: { status: "COMPLETED", completedAt: { gte: som } } }),
    prisma.leadFollowUp.count({ where: { status: "COMPLETED", completedAt: { gte: som }, isOnTime: true } }),
    prisma.lead.groupBy({ by: ["segmentId"], where: leadWhere, _count: true }),
    prisma.lead.groupBy({ by: ["segmentId"], where: { ...leadWhere, outcome: "WON" }, _count: true }),
    prisma.lead.groupBy({ by: ["segmentId"], where: { ...leadWhere, outcome: "LOST" }, _count: true }),
    prisma.lead.groupBy({ by: ["segmentId"], where: { ...leadWhere, temperature: "HOT" }, _count: true }),
    buildTeamAggregates(),
    prisma.segment.findMany({ select: { id: true, name: true } }),
    conversionRates(leadWhere as Record<string, unknown>),
    avgResponseTime({ days: 30 }),
  ])

  const countOf = (rows: { _count: unknown }[], keyName: string, key: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((rows as any[]).find((r) => r[keyName] === key)?._count ?? 0) as number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapSeg = (rows: any[]) =>
    new Map(rows.map((r) => [r.segmentId ?? "none", typeof r._count === "number" ? r._count : 0]))

  const segName = new Map(segments.map((s) => [s.id, s.name]))
  const wonSeg = mapSeg(wonBySegment as never)
  const lostSeg = mapSeg(lostBySegment as never)
  const hotSeg = mapSeg(hotBySegment as never)

  const segmentPerformance = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bySegment as any[])
      .map((r) => {
        const key = r.segmentId ?? "none"
        const leads = typeof r._count === "number" ? r._count : 0
        const won = wonSeg.get(key) ?? 0
        const lost = lostSeg.get(key) ?? 0
        return {
          segmentId: r.segmentId,
          name: r.segmentId ? segName.get(r.segmentId) ?? "—" : "Tanpa Segmen",
          leads,
          hot: hotSeg.get(key) ?? 0,
          won,
          lost,
          winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
        }
      })
      .sort((a, b) => b.leads - a.leads)

  return NextResponse.json({
    filters: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, segmentId },
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
      avgResponseMinutes: resp.avgMs != null ? Math.round(resp.avgMs / 60000) : null,
    },
    conversion: conv,
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
