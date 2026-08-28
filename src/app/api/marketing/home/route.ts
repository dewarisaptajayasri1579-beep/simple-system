import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { endOfToday, startOfToday } from "@/lib/marketing/follow-up"
import { actableLeadIds } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

const STAGE_LABEL: Record<string, string> = {
  NONE: "Belum ada tahap",
  DISCUSSION: "Diskusi",
  ZOOM_DEMO: "Zoom/Demo",
  PROPOSAL: "Penawaran terkirim",
  NEGOTIATION: "Negosiasi",
}

/**
 * GET /api/marketing/home — data Beranda.
 *  scope=mine (default) | all
 *  Return: kpi { hotLeads, followUpToday, followUpOverdue, unrepliedChats } + workOn (10 lead
 *  OPEN prioritas tertinggi, dengan alasan singkat + next follow up).
 */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "mine"
  const mineLeadFilter: Prisma.LeadWhereInput =
    scope === "mine" ? { assignments: { some: { assignedUserId: user.id, isActive: true } } } : {}
  const mineFuFilter: Prisma.LeadFollowUpWhereInput = scope === "mine" ? { assignedUserId: user.id } : {}

  const sot = startOfToday()
  const eot = endOfToday()

  const [hotLeads, followUpToday, followUpOverdue, unrepliedChats, workRows] = await Promise.all([
    prisma.lead.count({ where: { ...mineLeadFilter, temperature: "HOT", outcome: "OPEN" } }),
    prisma.leadFollowUp.count({ where: { ...mineFuFilter, status: "OPEN", scheduledAt: { gte: sot, lte: eot } } }),
    prisma.leadFollowUp.count({ where: { ...mineFuFilter, status: "OPEN", scheduledAt: { lt: sot } } }),
    prisma.conversation.count({
      where: { unreadCustomerCount: { gt: 0 }, ...(scope === "mine" ? { lead: mineLeadFilter } : {}) },
    }),
    prisma.lead.findMany({
      where: { ...mineLeadFilter, outcome: "OPEN" },
      orderBy: [{ priorityScore: "desc" }, { lastInteractionAt: { sort: "desc", nulls: "last" } }],
      take: 10,
      select: {
        id: true,
        displayName: true,
        companyName: true,
        temperature: true,
        currentActivityStage: true,
        priorityScore: true,
        priorityLevel: true,
        lastCustomerMessageAt: true,
        lastInteractionAt: true,
        segment: { select: { name: true } },
      },
    }),
  ])

  const leadIds = workRows.map((r) => r.id)
  const [nextFollowUps, openFuLeadIds, actable, convByLead] = await Promise.all([
    prisma.leadFollowUp.groupBy({
      by: ["leadId"],
      where: { leadId: { in: leadIds }, status: "OPEN" },
      _min: { scheduledAt: true },
    }),
    prisma.leadFollowUp.findMany({
      where: { leadId: { in: leadIds }, status: "OPEN", scheduledAt: { lt: sot } },
      select: { leadId: true },
      distinct: ["leadId"],
    }),
    actableLeadIds(user, leadIds),
    prisma.conversation.findMany({
      where: { leadId: { in: leadIds } },
      select: { leadId: true, id: true, unreadCustomerCount: true },
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    }),
  ])
  const nextFuByLead = new Map(nextFollowUps.map((g) => [g.leadId, g._min.scheduledAt]))
  const overdueLeadSet = new Set(openFuLeadIds.map((r) => r.leadId))
  const firstConvByLead = new Map<string, { id: string; unread: number }>()
  for (const c of convByLead) {
    if (!firstConvByLead.has(c.leadId)) firstConvByLead.set(c.leadId, { id: c.id, unread: c.unreadCustomerCount })
  }

  const workOn = workRows.map((r) => {
    const conv = firstConvByLead.get(r.id) ?? null
    const reasons: string[] = []
    if (r.temperature === "HOT") reasons.push("Hot")
    else if (r.temperature === "WARM") reasons.push("Warm")
    if (r.currentActivityStage !== "NONE") reasons.push(STAGE_LABEL[r.currentActivityStage] ?? r.currentActivityStage)
    if (overdueLeadSet.has(r.id)) reasons.push("Follow up terlambat")
    else if (nextFuByLead.get(r.id)) reasons.push("Ada follow up terjadwal")
    if (conv && conv.unread > 0) reasons.push("Chat belum dibalas")

    let nextAction = "Lanjutkan diskusi"
    if (conv && conv.unread > 0) nextAction = "Balas chat customer"
    else if (overdueLeadSet.has(r.id)) nextAction = "Kerjakan follow up yang terlambat"
    else if (r.currentActivityStage === "PROPOSAL") nextAction = "Kejar keputusan penawaran"
    else if (r.currentActivityStage === "NEGOTIATION") nextAction = "Dorong closing"

    return {
      id: r.id,
      displayName: r.displayName,
      companyName: r.companyName,
      temperature: r.temperature,
      stage: r.currentActivityStage,
      segmentName: r.segment?.name ?? null,
      priorityScore: r.priorityScore,
      priorityLevel: r.priorityLevel,
      reason: reasons.join(" · ") || "Pantau",
      nextAction,
      nextFollowUpAt: nextFuByLead.get(r.id)?.toISOString() ?? null,
      conversationId: conv?.id ?? null,
      unread: conv?.unread ?? 0,
      canAct: actable.has(r.id),
    }
  })

  return NextResponse.json({
    scope,
    kpi: { hotLeads, followUpToday, followUpOverdue, unrepliedChats },
    workOn,
  })
}
