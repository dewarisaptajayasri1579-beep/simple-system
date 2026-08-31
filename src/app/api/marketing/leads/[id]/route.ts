import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead, resolveMarketingRole } from "@/lib/marketing/permissions"
import { recalcLeadPriority } from "@/lib/marketing/priority"
import { prisma } from "@/lib/prisma"

/** GET — detail lengkap 1 lead. Role SALES cuma boleh buka lead yang dia PIC-nya (404 kalau
 *  bukan) — Manager/SPV tetap transparan lihat semua. PATCH — edit field identitas + segmentasi
 *  (cek `canActOnLead` → 403). Perubahan segment ditulis ke LeadSegmentHistory. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const marketingRole = await resolveMarketingRole(user.id, user.role)
  if (marketingRole === "SALES") {
    const assigned = await prisma.leadAssignment.findFirst({
      where: { leadId: id, assignedUserId: user.id, isActive: true },
      select: { id: true },
    })
    if (!assigned) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      segment: { select: { id: true, name: true } },
      source: { select: { id: true, name: true } },
      lostReason: { select: { id: true, name: true } },
      buyingPowerTier: { select: { id: true, name: true } },
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
        select: {
          id: true,
          lastMessageAt: true,
          unreadCustomerCount: true,
          channel: true,
          whatsappConnection: { select: { label: true, phoneNumber: true } },
        },
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

  const convIds = lead.conversations.map((c) => c.id)
  const [canAct, auditRows, tempRec, buyingPowerRec] = await Promise.all([
    canActOnLead(user, id),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "lead", entityId: id },
          { entityType: "conversation", entityId: { in: convIds.length ? convIds : ["_none_"] } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, createdAt: true, actorUser: { select: { name: true } } },
    }),
    prisma.leadAiAnalysis.findFirst({
      where: { leadId: id, analysisType: "TEMPERATURE_RECOMMENDATION", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { outputJson: true, createdAt: true },
    }),
    prisma.leadAiAnalysis.findFirst({
      where: { leadId: id, analysisType: "BUYING_POWER_RECOMMENDATION", status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { outputJson: true, createdAt: true },
    }),
  ])
  const activePic = lead.assignments.find((a) => a.isActive)?.assignedUser ?? null
  const isCurrentPic = activePic?.id === user.id
  const lockActive = lead.temperatureLockedUntil != null && lead.temperatureLockedUntil.getTime() > Date.now()

  return NextResponse.json({
    lead: serializeLead(lead),
    pic: activePic,
    canAct,
    viewerRole: marketingRole,
    isCurrentPic,
    temperatureSuggestion: tempRec
      ? { ...(tempRec.outputJson as Record<string, unknown>), at: tempRec.createdAt.toISOString(), lockedUntil: lockActive ? lead.temperatureLockedUntil!.toISOString() : null }
      : null,
    buyingPowerSuggestion: (() => {
      if (!buyingPowerRec) return null
      const o = buyingPowerRec.outputJson as Record<string, unknown>
      // Sembunyikan kalau saran = tier yang sudah dipakai sekarang.
      if (o.suggestedTierId && o.suggestedTierId === lead.buyingPowerTierId) return null
      return { ...o, at: buyingPowerRec.createdAt.toISOString() }
    })(),
    auditTrail: auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.actorUser?.name ?? "Sistem",
      at: a.createdAt.toISOString(),
    })),
  })
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
      buyingPowerTierId: true,
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
  if ("buyingPowerTierId" in body) {
    data.buyingPowerTierId = str(body.buyingPowerTierId) || null
    // "Terapkan saran AI" kirim buyingPowerSource:"AI"; edit manual (chip) default "MANUAL".
    data.buyingPowerSource = body.buyingPowerSource === "AI" && data.buyingPowerTierId ? "AI" : "MANUAL"
  }
  if ("buyingPowerNote" in body) data.buyingPowerNote = str(body.buyingPowerNote) || null
  if ("note" in body) data.note = str(body.note) || null

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })

  const segmentChanged = "segmentId" in data && data.segmentId !== existing.segmentId
  const buyingPowerChanged = "buyingPowerTierId" in data && data.buyingPowerTierId !== existing.buyingPowerTierId

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

  // Kemampuan beli ikut jadi modifier Priority Score → hitung ulang kalau berubah.
  if (buyingPowerChanged) {
    await recalcLeadPriority(id).catch(() => {})
  }

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
    note: lead.note ?? null,
    temperature: lead.temperature,
    temperatureSource: lead.temperatureSource,
    outcome: lead.outcome,
    currentActivityStage: lead.currentActivityStage,
    priorityScore: lead.priorityScore,
    priorityLevel: lead.priorityLevel,
    segment: lead.segment,
    source: lead.source,
    lostReason: lead.lostReason,
    buyingPowerTier: lead.buyingPowerTier,
    buyingPowerNote: lead.buyingPowerNote ?? null,
    buyingPowerSource: lead.buyingPowerSource,
    firstContactAt: lead.firstContactAt?.toISOString() ?? null,
    lastInteractionAt: lead.lastInteractionAt?.toISOString() ?? null,
    lastChatAt: lead.lastChatAt?.toISOString() ?? null,
    lastCustomerMessageAt: lead.lastCustomerMessageAt?.toISOString() ?? null,
    lastSalesMessageAt: lead.lastSalesMessageAt?.toISOString() ?? null,
    wonAt: lead.wonAt?.toISOString() ?? null,
    wonNote: lead.wonNote ?? null,
    dealValue: lead.dealValue ?? null,
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
      whatsappConnectionLabel: c.whatsappConnection?.label ?? c.whatsappConnection?.phoneNumber ?? null,
    })),
    activities: lead.activities.map((a: any) => ({
      id: a.id,
      type: a.activityType,
      actorUser: a.actorUser,
      occurredAt: a.occurredAt.toISOString(),
      note: a.note,
      result: a.result,
      isVoid: a.isVoid,
      attachmentUrl: a.attachmentUrl,
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
