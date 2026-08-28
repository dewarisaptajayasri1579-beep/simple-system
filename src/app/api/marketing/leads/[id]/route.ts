import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — detail lengkap 1 lead (boleh dibuka siapa pun anggota tim). PATCH — edit field identitas
 *  + segmentasi (cek `canActOnLead` → 403). Perubahan segment ditulis ke LeadSegmentHistory. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      segment: { select: { id: true, name: true } },
      source: { select: { id: true, name: true } },
      lostReason: { select: { id: true, name: true } },
      assignments: {
        orderBy: { startedAt: "desc" },
        take: 20,
        include: {
          assignedUser: { select: { id: true, name: true } },
          assignedByUser: { select: { id: true, name: true } },
        },
      },
      conversations: {
        orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
        select: { id: true, lastMessageAt: true, unreadCustomerCount: true, channel: true },
      },
      activities: {
        orderBy: { occurredAt: "desc" },
        take: 30,
        include: { activityType: { select: { code: true, name: true } }, actorUser: { select: { id: true, name: true } } },
      },
      followUps: {
        orderBy: { scheduledAt: "desc" },
        take: 30,
        include: {
          resultType: { select: { code: true, name: true } },
          assignedUser: { select: { id: true, name: true } },
        },
      },
      temperatureHistory: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { changedByUser: { select: { id: true, name: true } } },
      },
      prioritySnapshots: { orderBy: { calculatedAt: "desc" }, take: 1 },
    },
  })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })

  const canAct = await canActOnLead(user, id)
  const activePic = lead.assignments.find((a) => a.isActive)?.assignedUser ?? null

  return NextResponse.json({ lead: serializeLead(lead), pic: activePic, canAct })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const existing = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      companyName: true,
      contactName: true,
      email: true,
      city: true,
      segmentId: true,
      sourceId: true,
    },
  })
  if (!existing) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  if (!(await canActOnLead(user, id))) {
    return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined)
  if (str(body.displayName)) data.displayName = str(body.displayName)
  if ("companyName" in body) data.companyName = str(body.companyName) || null
  if ("contactName" in body) data.contactName = str(body.contactName) || null
  if ("email" in body) data.email = str(body.email)?.toLowerCase() || null
  if ("city" in body) data.city = str(body.city) || null
  if ("sourceId" in body) data.sourceId = str(body.sourceId) || null
  if ("segmentId" in body) data.segmentId = str(body.segmentId) || null

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })

  const segmentChanged = "segmentId" in data && data.segmentId !== existing.segmentId

  const updated = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.update({ where: { id }, data })
    if (segmentChanged && data.segmentId) {
      await tx.leadSegmentHistory.create({
        data: {
          leadId: id,
          fromSegmentId: existing.segmentId,
          toSegmentId: data.segmentId as string,
          source: "MANUAL",
          changedByUserId: user.id,
        },
      })
    }
    return lead
  })

  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.update",
    entityType: "lead",
    entityId: id,
    before: existing,
    after: data,
  })

  return NextResponse.json({ lead: { id: updated.id } })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeLead(lead: any) {
  return {
    id: lead.id,
    displayName: lead.displayName,
    companyName: lead.companyName,
    contactName: lead.contactName,
    whatsappNumber: lead.whatsappNumber,
    email: lead.email,
    city: lead.city,
    temperature: lead.temperature,
    temperatureSource: lead.temperatureSource,
    outcome: lead.outcome,
    currentActivityStage: lead.currentActivityStage,
    priorityScore: lead.priorityScore,
    priorityLevel: lead.priorityLevel,
    segment: lead.segment,
    source: lead.source,
    lostReason: lead.lostReason,
    firstContactAt: lead.firstContactAt?.toISOString() ?? null,
    lastInteractionAt: lead.lastInteractionAt?.toISOString() ?? null,
    lastCustomerMessageAt: lead.lastCustomerMessageAt?.toISOString() ?? null,
    lastSalesMessageAt: lead.lastSalesMessageAt?.toISOString() ?? null,
    wonAt: lead.wonAt?.toISOString() ?? null,
    lostAt: lead.lostAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    assignments: lead.assignments.map((a: any) => ({
      id: a.id,
      assignmentType: a.assignmentType,
      isActive: a.isActive,
      reason: a.reason,
      startedAt: a.startedAt.toISOString(),
      endedAt: a.endedAt?.toISOString() ?? null,
      assignedUser: a.assignedUser,
      assignedByUser: a.assignedByUser,
    })),
    conversations: lead.conversations.map((c: any) => ({
      id: c.id,
      channel: c.channel,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      unreadCustomerCount: c.unreadCustomerCount,
    })),
    activities: lead.activities.map((a: any) => ({
      id: a.id,
      type: a.activityType,
      actorUser: a.actorUser,
      occurredAt: a.occurredAt.toISOString(),
      note: a.note,
      result: a.result,
      isVoid: a.isVoid,
    })),
    followUps: lead.followUps.map((f: any) => ({
      id: f.id,
      scheduledAt: f.scheduledAt.toISOString(),
      purpose: f.purpose,
      note: f.note,
      status: f.status,
      resultType: f.resultType,
      resultNote: f.resultNote,
      completedAt: f.completedAt?.toISOString() ?? null,
      assignedUser: f.assignedUser,
    })),
    temperatureHistory: lead.temperatureHistory.map((h: any) => ({
      id: h.id,
      fromTemperature: h.fromTemperature,
      toTemperature: h.toTemperature,
      source: h.source,
      reason: h.reason,
      changedByUser: h.changedByUser,
      createdAt: h.createdAt.toISOString(),
    })),
    latestPriority: lead.prioritySnapshots[0]
      ? {
          score: lead.prioritySnapshots[0].score,
          level: lead.prioritySnapshots[0].level,
          reasonJson: lead.prioritySnapshots[0].reasonJson,
          calculatedAt: lead.prioritySnapshots[0].calculatedAt.toISOString(),
        }
      : null,
  }
}
