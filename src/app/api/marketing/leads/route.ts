import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { actableLeadIds } from "@/lib/marketing/permissions"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/wahub"

/**
 * GET /api/marketing/leads — daftar lead (transparan: default SEMUA lead).
 *  scope=all|mine · q · segmentId · temperature · stage · outcome · priorityLevel · picUserId
 *  · page/limit (limit maks 100) · sort=priority|recent|created (default priority)
 * Tiap item: PIC, next follow up (OPEN terdekat), idleDays, canAct.
 */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const scope = sp.get("scope") === "mine" ? "mine" : "all"
  const q = (sp.get("q") ?? "").trim()
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 30))
  const sort = sp.get("sort") ?? "priority"

  const where: Prisma.LeadWhereInput = {}
  if (scope === "mine") where.assignments = { some: { assignedUserId: user.id, isActive: true } }
  const picUserId = sp.get("picUserId")
  if (picUserId) where.assignments = { some: { assignedUserId: picUserId, isActive: true } }
  if (sp.get("segmentId")) where.segmentId = sp.get("segmentId")
  if (sp.get("temperature")) where.temperature = sp.get("temperature")!
  if (sp.get("stage")) where.currentActivityStage = sp.get("stage")!
  if (sp.get("outcome")) where.outcome = sp.get("outcome")!
  if (sp.get("priorityLevel")) where.priorityLevel = sp.get("priorityLevel")!
  if (q) {
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { whatsappNumber: { contains: q.replace(/[^0-9]/g, "") || q } },
    ]
  }

  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    sort === "recent"
      ? [{ lastInteractionAt: { sort: "desc", nulls: "last" } }]
      : sort === "created"
        ? [{ createdAt: "desc" }]
        : [{ priorityScore: "desc" }, { lastInteractionAt: { sort: "desc", nulls: "last" } }]

  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        displayName: true,
        companyName: true,
        whatsappNumber: true,
        temperature: true,
        currentActivityStage: true,
        priorityScore: true,
        priorityLevel: true,
        outcome: true,
        lastInteractionAt: true,
        firstContactAt: true,
        createdAt: true,
        segment: { select: { name: true } },
      },
    }),
  ])

  const leadIds = rows.map((r) => r.id)
  const [assignments, nextFollowUps, actable] = await Promise.all([
    prisma.leadAssignment.findMany({
      where: { leadId: { in: leadIds }, isActive: true },
      select: { leadId: true, assignedUser: { select: { id: true, name: true } } },
    }),
    prisma.leadFollowUp.groupBy({
      by: ["leadId"],
      where: { leadId: { in: leadIds }, status: "OPEN" },
      _min: { scheduledAt: true },
    }),
    actableLeadIds(user, leadIds),
  ])
  const picByLead = new Map(assignments.map((a) => [a.leadId, a.assignedUser]))
  const nextFuByLead = new Map(nextFollowUps.map((g) => [g.leadId, g._min.scheduledAt]))
  const now = Date.now()

  const leads = rows.map((r) => {
    const ref = r.lastInteractionAt ?? r.firstContactAt
    return {
      id: r.id,
      displayName: r.displayName,
      companyName: r.companyName,
      whatsappNumber: r.whatsappNumber,
      temperature: r.temperature,
      currentActivityStage: r.currentActivityStage,
      priorityScore: r.priorityScore,
      priorityLevel: r.priorityLevel,
      outcome: r.outcome,
      segmentName: r.segment?.name ?? null,
      pic: picByLead.get(r.id) ?? null,
      lastInteractionAt: r.lastInteractionAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      nextFollowUpAt: nextFuByLead.get(r.id)?.toISOString() ?? null,
      idleDays: ref ? Math.floor((now - ref.getTime()) / 86400000) : null,
      canAct: actable.has(r.id),
    }
  })

  return NextResponse.json({ leads, page, limit, total, hasMore: page * limit < total })
}

/**
 * POST /api/marketing/leads — buat lead manual (lead dari luar WhatsApp: pameran, referral, dll).
 * Pembuat otomatis jadi PIC (LeadAssignment PRIMARY). Nomor WA wajib & unik.
 */
export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const displayName = str(body?.displayName)
  const rawPhone = str(body?.whatsappNumber)
  if (!displayName) return NextResponse.json({ error: "Nama lead wajib diisi" }, { status: 400 })
  if (!rawPhone) return NextResponse.json({ error: "Nomor WhatsApp wajib diisi" }, { status: 400 })
  const whatsappNumber = normalizePhoneNumber(rawPhone)

  const dup = await prisma.lead.findFirst({ where: { whatsappNumber }, select: { id: true, displayName: true } })
  if (dup) {
    return NextResponse.json(
      { error: `Nomor ini sudah jadi lead "${dup.displayName}".`, existingLeadId: dup.id },
      { status: 409 },
    )
  }

  const now = new Date()
  const lead = await prisma.lead.create({
    data: {
      displayName,
      whatsappNumber,
      companyName: str(body?.companyName) || null,
      contactName: str(body?.contactName) || null,
      email: str(body?.email).toLowerCase() || null,
      city: str(body?.city) || null,
      segmentId: str(body?.segmentId) || null,
      sourceId: str(body?.sourceId) || null,
      firstContactAt: now,
      lastInteractionAt: now,
      temperatureSource: "MANUAL",
    },
  })
  await prisma.leadAssignment.create({
    data: { leadId: lead.id, assignedUserId: user.id, assignedByUserId: user.id, assignmentType: "PRIMARY" },
  })
  await recalcLeadDerived(lead.id).catch(() => {})
  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.create",
    entityType: "lead",
    entityId: lead.id,
    after: { displayName, whatsappNumber, manual: true },
  })

  return NextResponse.json({ lead: { id: lead.id } }, { status: 201 })
}
