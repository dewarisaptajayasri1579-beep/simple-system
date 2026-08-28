import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { actableLeadIds } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/marketing/conversations — daftar percakapan.
 *  - Default `scope=all`: SEMUA percakapan (transparansi tim). `scope=mine`: hanya lead yang
 *    PIC-nya user ini.
 *  - `filter`: all | unread | priority | hot
 *  - `q`: cari nama / perusahaan / nomor WA
 *  - `page` / `limit` (offset pagination, limit maks 100)
 * Tiap item bawa `canAct` (boleh balas/aksi atau tidak) supaya UI tak perlu cek ulang.
 */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get("scope") === "mine" ? "mine" : "all"
  const filter = searchParams.get("filter") ?? "all"
  const q = (searchParams.get("q") ?? "").trim()
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 30))

  const leadWhere: Prisma.LeadWhereInput = {}
  if (scope === "mine") leadWhere.assignments = { some: { assignedUserId: user.id, isActive: true } }
  if (filter === "hot") leadWhere.temperature = "HOT"
  if (filter === "priority") leadWhere.priorityLevel = { in: ["HIGH", "TOP"] }
  if (q) {
    leadWhere.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { whatsappNumber: { contains: q.replace(/[^0-9]/g, "") || q } },
    ]
  }

  const where: Prisma.ConversationWhereInput = {}
  if (Object.keys(leadWhere).length > 0) where.lead = leadWhere
  if (filter === "unread") where.unreadCustomerCount = { gt: 0 }

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        leadId: true,
        lastMessageAt: true,
        unreadCustomerCount: true,
        lead: {
          select: {
            displayName: true,
            companyName: true,
            whatsappNumber: true,
            temperature: true,
            priorityLevel: true,
            segment: { select: { name: true } },
          },
        },
        messages: { take: 1, orderBy: { sentAt: "desc" }, select: { body: true, direction: true } },
      },
    }),
  ])

  const leadIds = [...new Set(rows.map((r) => r.leadId))]
  const [assignments, actable] = await Promise.all([
    prisma.leadAssignment.findMany({
      where: { leadId: { in: leadIds }, isActive: true },
      select: { leadId: true, assignedUser: { select: { id: true, name: true } } },
    }),
    actableLeadIds(user, leadIds),
  ])
  const picByLead = new Map(assignments.map((a) => [a.leadId, a.assignedUser]))

  const conversations = rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    lead: {
      displayName: r.lead.displayName,
      companyName: r.lead.companyName,
      whatsappNumber: r.lead.whatsappNumber,
      temperature: r.lead.temperature,
      priorityLevel: r.lead.priorityLevel,
      segmentName: r.lead.segment?.name ?? null,
    },
    pic: picByLead.get(r.leadId) ?? null,
    lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: r.messages[0] ?? null,
    unreadCustomerCount: r.unreadCustomerCount,
    canAct: actable.has(r.leadId),
  }))

  return NextResponse.json({ conversations, page, limit, total, hasMore: page * limit < total })
}
