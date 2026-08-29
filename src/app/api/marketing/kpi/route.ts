import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { buildTeamAggregates } from "@/lib/marketing/analytics"
import { avgResponseTimeByUser, conversionRates } from "@/lib/marketing/kpi"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/marketing/kpi?scope=me|team
 *  - `me`   : KPI Sales itu sendiri (semua role boleh).
 *  - `team` : KPI anggota tim. MANAGER/owner → semua Sales. SPV → Sales yang dia supervisi
 *             (+ dirinya). SALES → ditolak (pakai `me`).
 * Tiap baris: agregat `buildTeamAggregates` + avg response time (working-hours aware) + conversion.
 */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const role = await resolveMarketingRole(user.id, user.role)
  const scope = new URL(request.url).searchParams.get("scope") === "team" ? "team" : "me"

  if (scope === "team" && role === "SALES") {
    return NextResponse.json({ error: "Kamu hanya bisa melihat KPI sendiri." }, { status: 403 })
  }

  // Tentukan set userId yang di-scope.
  let userIds: string[]
  if (scope === "me") {
    userIds = [user.id]
  } else if (role === "SPV") {
    const supervised = await prisma.teamMembership.findMany({
      where: { supervisorUserId: user.id, activeUntil: null },
      select: { userId: true },
    })
    userIds = [...new Set([user.id, ...supervised.map((m) => m.userId)])]
  } else {
    // MANAGER / owner
    const all = await prisma.user.findMany({
      where: { isActive: true, OR: [{ role: "owner" }, { modules: { has: "marketing" } }] },
      select: { id: true },
    })
    userIds = all.map((u) => u.id)
  }

  const idSet = new Set(userIds)
  const [aggregatesAll, respByUser] = await Promise.all([
    buildTeamAggregates(),
    avgResponseTimeByUser(userIds, 30),
  ])
  const members = aggregatesAll
    .filter((m) => idSet.has(m.userId))
    .map((m) => {
      const resp = respByUser.get(m.userId)
      const onTimeRate =
        m.followUpCompletedThisMonth > 0
          ? Math.round((m.followUpOnTimeThisMonth / m.followUpCompletedThisMonth) * 100)
          : null
      return {
        ...m,
        onTimeFollowUpRate: onTimeRate,
        avgResponseMinutes: resp?.avgMs != null ? Math.round(resp.avgMs / 60000) : null,
        responseSamples: resp?.samples ?? 0,
      }
    })

  // Conversion — untuk `me` per-Sales; untuk `team` gabungan anggota yang di-scope.
  const conversionWhere =
    scope === "me"
      ? { assignments: { some: { assignedUserId: user.id } } }
      : { assignments: { some: { assignedUserId: { in: userIds } } } }
  const conversion = await conversionRates(conversionWhere as Record<string, unknown>)

  // Total tim (untuk header di scope team).
  const totals = members.reduce(
    (t, m) => ({
      activeLeads: t.activeLeads + m.activeLeads,
      hotLeads: t.hotLeads + m.hotLeads,
      followUpOverdue: t.followUpOverdue + m.followUpOverdue,
      unrepliedChats: t.unrepliedChats + m.unrepliedChats,
      wonThisMonth: t.wonThisMonth + m.wonThisMonth,
    }),
    { activeLeads: 0, hotLeads: 0, followUpOverdue: 0, unrepliedChats: 0, wonThisMonth: 0 },
  )

  return NextResponse.json({ scope, role, canSeeTeam: role !== "SALES", members, conversion, totals })
}
