import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveReportPeriod } from "@/lib/report-period"
import { prisma } from "@/lib/prisma"

const FUNNEL_STAGES = [
  { stage: "NONE", label: "Belum ada aktivitas" },
  { stage: "DISCUSSION", label: "Diskusi" },
  { stage: "ZOOM_DEMO", label: "Zoom/Demo" },
  { stage: "PROPOSAL", label: "Penawaran" },
  { stage: "NEGOTIATION", label: "Negosiasi" },
] as const

/** GET /api/marketing/reports/quality — Laporan Marketing tab "Kualitas Lead": distribusi
 *  Scoring (priorityLevel) & Temperature, funnel tahap DENGAN % dari total & drop-off per tahap
 *  (beda dari funnel di /api/marketing/dashboard yang cuma hitungan mentah lead OPEN), dan
 *  ranking PENUH alasan Lost (dashboard cuma nampilin top-2 per segmen). Cohort = lead yang
 *  `createdAt` dalam rentang filter (sama seperti tab Volume), independen dari kapan status
 *  akhirnya berubah. */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const { from, to, fromIso, toIso } = resolveReportPeriod({ from: sp.get("from") || undefined, to: sp.get("to") || undefined })
  const salesId = sp.get("salesId") || null
  const segmentId = sp.get("segmentId") || null
  const sourceId = sp.get("sourceId") || null

  const leadWhere: Prisma.LeadWhereInput = { createdAt: { gte: from, lte: to } }
  if (segmentId) leadWhere.segmentId = segmentId
  if (sourceId) leadWhere.sourceId = sourceId
  if (salesId) leadWhere.assignments = { some: { isActive: true, assignedUserId: salesId } }

  const [totalCohort, byPriority, byTemp, byStage, byOutcome, byLostReason, lostReasons] = await Promise.all([
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.groupBy({ by: ["priorityLevel"], where: leadWhere, _count: true }),
    prisma.lead.groupBy({ by: ["temperature"], where: leadWhere, _count: true }),
    prisma.lead.groupBy({ by: ["currentActivityStage"], where: leadWhere, _count: true }),
    prisma.lead.groupBy({ by: ["outcome"], where: leadWhere, _count: true }),
    prisma.lead.groupBy({
      by: ["lostReasonId"],
      where: { ...leadWhere, outcome: "LOST", lostReasonId: { not: null } },
      _count: true,
    }),
    prisma.leadLostReason.findMany({ select: { id: true, name: true } }),
  ])

  const countOf = (rows: { _count: unknown }[], keyName: string, key: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((rows as any[]).find((r) => r[keyName] === key)?._count ?? 0) as number

  const priorityDistribution = ["TOP", "HIGH", "MONITOR", "LOW"].map((level) => ({
    level,
    count: countOf(byPriority as never, "priorityLevel", level),
  }))
  const temperatureDistribution = ["HOT", "WARM", "COLD"].map((t) => ({
    temperature: t,
    count: countOf(byTemp as never, "temperature", t),
  }))

  let prevCount = totalCohort
  const funnel = FUNNEL_STAGES.map(({ stage, label }) => {
    const count = countOf(byStage as never, "currentActivityStage", stage)
    const entry = {
      stage,
      label,
      count,
      pctOfTotal: totalCohort > 0 ? Math.round((count / totalCohort) * 100) : null,
      dropOffPct: prevCount > 0 ? Math.round(100 - (count / prevCount) * 100) : null,
    }
    prevCount = count
    return entry
  })

  const reasonName = new Map(lostReasons.map((r) => [r.id, r.name]))
  const lostReasonBreakdown = // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (byLostReason as any[])
      .map((r) => ({ name: reasonName.get(r.lostReasonId) ?? "—", count: typeof r._count === "number" ? r._count : 0 }))
      .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    filters: { from: fromIso, to: toIso, salesId, segmentId, sourceId },
    totalCohort,
    priorityDistribution,
    temperatureDistribution,
    funnel,
    outcome: {
      open: countOf(byOutcome as never, "outcome", "OPEN"),
      won: countOf(byOutcome as never, "outcome", "WON"),
      lost: countOf(byOutcome as never, "outcome", "LOST"),
    },
    lostReasons: lostReasonBreakdown,
  })
}
