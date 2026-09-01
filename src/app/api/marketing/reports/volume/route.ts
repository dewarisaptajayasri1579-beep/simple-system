import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { resolveReportPeriod } from "@/lib/report-period"
import { prisma } from "@/lib/prisma"

/** GET /api/marketing/reports/volume — Laporan Marketing tab "Volume": trend harian jumlah lead
 *  masuk + pivot per Sales/Segmen per tanggal + ranking per Sumber. "Lead masuk pada tanggal X"
 *  pakai `Lead.createdAt` — konsisten dengan `/api/marketing/dashboard` supaya total lead di 2
 *  laporan untuk rentang yang sama tidak beda angka. Satu query bounded by tanggal, sisanya
 *  di-reduce di JS (bukan groupBy berlapis) supaya gampang bikin 3 breakdown sekaligus dari 1 hasil. */
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

  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: {
      createdAt: true,
      segmentId: true,
      sourceId: true,
      assignments: { where: { isActive: true }, select: { assignedUserId: true } },
    },
  })

  const dateKey = (d: Date) => d.toISOString().slice(0, 10)

  const trendMap = new Map<string, number>()
  const bySalesByDateMap = new Map<string, Map<string, number>>() // date -> salesId -> count
  const bySegmentByDateMap = new Map<string, Map<string, number>>() // date -> segmentId("none") -> count
  const bySourceMap = new Map<string, number>() // sourceId("none") -> count

  const salesIds = new Set<string>()
  const segmentIds = new Set<string>()
  const sourceIds = new Set<string>()

  for (const lead of leads) {
    const key = dateKey(lead.createdAt)
    trendMap.set(key, (trendMap.get(key) ?? 0) + 1)

    const pic = lead.assignments[0]?.assignedUserId ?? "none"
    if (pic !== "none") salesIds.add(pic)
    const salesRow = bySalesByDateMap.get(key) ?? new Map<string, number>()
    salesRow.set(pic, (salesRow.get(pic) ?? 0) + 1)
    bySalesByDateMap.set(key, salesRow)

    const seg = lead.segmentId ?? "none"
    if (lead.segmentId) segmentIds.add(lead.segmentId)
    const segRow = bySegmentByDateMap.get(key) ?? new Map<string, number>()
    segRow.set(seg, (segRow.get(seg) ?? 0) + 1)
    bySegmentByDateMap.set(key, segRow)

    const src = lead.sourceId ?? "none"
    if (lead.sourceId) sourceIds.add(lead.sourceId)
    bySourceMap.set(src, (bySourceMap.get(src) ?? 0) + 1)
  }

  const [salesUsers, segments, sources] = await Promise.all([
    salesIds.size > 0 ? prisma.user.findMany({ where: { id: { in: [...salesIds] } }, select: { id: true, name: true } }) : [],
    segmentIds.size > 0 ? prisma.segment.findMany({ where: { id: { in: [...segmentIds] } }, select: { id: true, name: true } }) : [],
    sourceIds.size > 0 ? prisma.leadSource.findMany({ where: { id: { in: [...sourceIds] } }, select: { id: true, name: true } }) : [],
  ])
  const salesNames = [{ id: "none", name: "Belum ada PIC" }, ...salesUsers]
  const segmentNames = [{ id: "none", name: "Tanpa Segmen" }, ...segments]

  const sortedDates = [...trendMap.keys()].sort()
  const toPivotRows = (byDate: Map<string, Map<string, number>>, dims: { id: string; name: string }[]) =>
    sortedDates.map((date) => {
      const row = byDate.get(date)
      const cells: Record<string, number> = {}
      let total = 0
      for (const dim of dims) {
        const c = row?.get(dim.id) ?? 0
        cells[dim.id] = c
        total += c
      }
      return { date, cells, total }
    })

  return NextResponse.json({
    filters: { from: fromIso, to: toIso, salesId, segmentId, sourceId },
    trend: sortedDates.map((date) => ({ date, count: trendMap.get(date) ?? 0 })),
    salesNames,
    segmentNames,
    bySalesByDate: toPivotRows(bySalesByDateMap, salesNames),
    bySegmentByDate: toPivotRows(bySegmentByDateMap, segmentNames),
    bySource: [...sourceIds]
      .map((id) => ({ sourceId: id, name: sources.find((s) => s.id === id)?.name ?? "—", count: bySourceMap.get(id) ?? 0 }))
      .concat(bySourceMap.has("none") ? [{ sourceId: "none", name: "Tanpa Sumber", count: bySourceMap.get("none")! }] : [])
      .sort((a, b) => b.count - a.count),
    totalLeads: leads.length,
  })
}
