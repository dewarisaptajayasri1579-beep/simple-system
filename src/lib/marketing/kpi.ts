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

/**
 * Avg response time per Sales — untuk tabel KPI tim. Diatribusikan ke pengirim balasan
 * (`Message.senderUserId` pada OUTBOUND), bukan PIC saat ini. 1 pasang = grup inbound berturut →
 * outbound pertama sesudahnya, dalam 1 conversation. Working-hours aware.
 */
export async function avgResponseTimeByUser(
  userIds: string[],
  days = 30,
): Promise<Map<string, { avgMs: number | null; samples: number }>> {
  const out = new Map<string, { avgMs: number | null; samples: number }>()
  for (const id of userIds) out.set(id, { avgMs: null, samples: 0 })
  if (userIds.length === 0) return out

  const since = new Date(Date.now() - days * 86400000)
  const messages = await prisma.message.findMany({
    where: {
      sentAt: { gte: since },
      conversation: { lead: { assignments: { some: { assignedUserId: { in: userIds } } } } },
    },
    orderBy: [{ conversationId: "asc" }, { sentAt: "asc" }],
    select: { conversationId: true, direction: true, senderUserId: true, sentAt: true },
    take: 20000,
  })

  // { userId -> [ms, ms, ...] }
  const perUser = new Map<string, number[]>()
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
      if (m.senderUserId && userIds.includes(m.senderUserId)) {
        const arr = perUser.get(m.senderUserId) ?? []
        arr.push(await workingMsBetween(pendingInbound, m.sentAt))
        perUser.set(m.senderUserId, arr)
      }
      pendingInbound = null
    }
  }

  for (const [uid, arr] of perUser) {
    const capped = arr.slice(0, 300)
    out.set(uid, {
      avgMs: capped.length ? Math.round(capped.reduce((s, x) => s + x, 0) / capped.length) : null,
      samples: capped.length,
    })
  }
  return out
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
