import { prisma } from "@/lib/prisma"
import { workingMsBetween } from "@/lib/marketing/working-hours"

/**
 * KPI turunan modul Marketing (docs/06 §20, §22): Avg Response Time (working-hours aware) &
 * Conversion rates. Semua dibatasi jendela waktu supaya query tidak menarik seluruh riwayat.
 */

/** Rata-rata waktu balas (ms, working-hours aware) untuk inbound customer dalam `days` terakhir.
 *  Grouping: inbound berturut-turut dihitung 1x sampai ada outbound sales (docs §20). */
export async function avgResponseTime(opts: { days?: number; assignedUserId?: string } = {}) {
  const days = opts.days ?? 30
  const since = new Date(Date.now() - days * 86400000)

  const convWhere: Record<string, unknown> = { lastMessageAt: { gte: since } }
  if (opts.assignedUserId) {
    convWhere.lead = { assignments: { some: { isActive: true, assignedUserId: opts.assignedUserId } } }
  }
  const conversations = await prisma.conversation.findMany({
    where: convWhere,
    select: { id: true },
    take: 500,
  })
  if (conversations.length === 0) return { avgMs: null, samples: 0 }

  const messages = await prisma.message.findMany({
    where: { conversationId: { in: conversations.map((c) => c.id) }, sentAt: { gte: since } },
    orderBy: [{ conversationId: "asc" }, { sentAt: "asc" }],
    select: { conversationId: true, direction: true, sentAt: true },
    take: 8000,
  })

  // kumpulkan pasangan (inbound pertama dari grup, outbound pertama sesudahnya)
  const pairs: [Date, Date][] = []
  let curConv: string | null = null
  let pendingInbound: Date | null = null
  for (const m of messages) {
    if (m.conversationId !== curConv) {
      curConv = m.conversationId
      pendingInbound = null
    }
    if (m.direction === "INBOUND") {
      if (!pendingInbound) pendingInbound = m.sentAt
    } else if (m.direction === "OUTBOUND" && pendingInbound) {
      pairs.push([pendingInbound, m.sentAt])
      pendingInbound = null
    }
  }

  const capped = pairs.slice(0, 400)
  let total = 0
  for (const [a, b] of capped) total += await workingMsBetween(a, b)
  return { avgMs: capped.length ? Math.round(total / capped.length) : null, samples: capped.length }
}

/** Conversion rates global (docs §22). `where` opsional untuk filter periode/segmen. */
export async function conversionRates(where: Record<string, unknown> = {}) {
  const [totalLeads, everHot, reachedProposal, reachedNegotiation, won, lost] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead
      .findMany({
        where: { ...where, temperatureHistory: { some: { toTemperature: "HOT" } } },
        select: { id: true },
      })
      .then((r) => r.length),
    prisma.lead.count({ where: { ...where, currentActivityStage: { in: ["PROPOSAL", "NEGOTIATION"] } } }),
    prisma.lead.count({ where: { ...where, currentActivityStage: "NEGOTIATION" } }),
    prisma.lead.count({ where: { ...where, outcome: "WON" } }),
    prisma.lead.count({ where: { ...where, outcome: "LOST" } }),
  ])

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null)
  return {
    leadToHot: pct(everHot, totalLeads),
    proposalRate: pct(reachedProposal, totalLeads),
    negotiationRate: pct(reachedNegotiation, reachedProposal),
    winRate: pct(won, won + lost),
  }
}
