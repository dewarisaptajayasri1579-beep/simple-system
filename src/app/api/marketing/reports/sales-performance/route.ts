import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { avgResponseTimeByUser } from "@/lib/marketing/kpi"
import { resolveReportPeriod } from "@/lib/report-period"
import { prisma } from "@/lib/prisma"

/** GET /api/marketing/reports/sales-performance — Laporan Marketing tab "Performa Sales":
 *  scorecard per Sales (lead ditangani, win rate, avg deal value, on-time follow-up rate, waktu
 *  respons, jumlah aktivitas) untuk 1 rentang tanggal yang bisa diubah — beda dari tabel Tim di
 *  /api/marketing/dashboard yang angkanya fixed "hari ini"/"bulan ini" dan tidak punya win
 *  rate/avg deal value/waktu respons. Semua query di-batch per-tim (groupBy/findMany sekali),
 *  BUKAN query per-Sales di dalam loop. */
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

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: "owner" }, { modules: { has: "marketing" } }],
      ...(salesId ? { id: salesId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
  const userIds = users.map((u) => u.id)

  const [leads, fuCompleted, fuOnTime, activityCounts] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhere,
      select: { outcome: true, dealValue: true, assignments: { where: { isActive: true }, select: { assignedUserId: true } } },
    }),
    prisma.leadFollowUp.groupBy({
      by: ["assignedUserId"],
      where: { assignedUserId: { in: userIds }, status: "COMPLETED", completedAt: { gte: from, lte: to } },
      _count: true,
    }),
    prisma.leadFollowUp.groupBy({
      by: ["assignedUserId"],
      where: { assignedUserId: { in: userIds }, status: "COMPLETED", completedAt: { gte: from, lte: to }, isOnTime: true },
      _count: true,
    }),
    prisma.leadActivity.groupBy({
      by: ["actorUserId"],
      where: { actorUserId: { in: userIds }, occurredAt: { gte: from, lte: to }, isVoid: false },
      _count: true,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ]) as [any[], any[], any[], any[]]

  const perSales = new Map<string, { leads: number; won: number; lost: number; dealValueSum: number }>()
  for (const uid of userIds) perSales.set(uid, { leads: 0, won: 0, lost: 0, dealValueSum: 0 })
  for (const lead of leads) {
    const pic = lead.assignments[0]?.assignedUserId
    if (!pic || !perSales.has(pic)) continue
    const s = perSales.get(pic)!
    s.leads += 1
    if (lead.outcome === "WON") {
      s.won += 1
      s.dealValueSum += lead.dealValue ?? 0
    } else if (lead.outcome === "LOST") {
      s.lost += 1
    }
  }

  const mapCount = (rows: { assignedUserId: string; _count: number }[]) =>
    new Map(rows.map((r) => [r.assignedUserId, typeof r._count === "number" ? r._count : 0]))
  const mFuCompleted = mapCount(fuCompleted)
  const mFuOnTime = mapCount(fuOnTime)
  const mActivity = new Map(activityCounts.map((r) => [r.actorUserId, typeof r._count === "number" ? r._count : 0]))

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000))
  const respByUser = await avgResponseTimeByUser(userIds, days)

  const rows = users.map((u) => {
    const s = perSales.get(u.id) ?? { leads: 0, won: 0, lost: 0, dealValueSum: 0 }
    const fuDone = mFuCompleted.get(u.id) ?? 0
    const fuOn = mFuOnTime.get(u.id) ?? 0
    const resp = respByUser.get(u.id)
    return {
      userId: u.id,
      name: u.name,
      leads: s.leads,
      won: s.won,
      lost: s.lost,
      winRate: s.won + s.lost > 0 ? Math.round((s.won / (s.won + s.lost)) * 100) : null,
      avgDealValue: s.won > 0 ? Math.round(s.dealValueSum / s.won) : null,
      followUpOnTimeRate: fuDone > 0 ? Math.round((fuOn / fuDone) * 100) : null,
      avgResponseMinutes: resp?.avgMs != null ? Math.round(resp.avgMs / 60000) : null,
      activityCount: mActivity.get(u.id) ?? 0,
    }
  })
  rows.sort((a, b) => b.leads - a.leads)

  return NextResponse.json({ filters: { from: fromIso, to: toIso, salesId, segmentId, sourceId }, rows })
}
