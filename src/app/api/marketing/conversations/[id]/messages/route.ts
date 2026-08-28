import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { MESSAGE_SELECT, messageDto } from "@/lib/marketing/inbox"
import { canActOnLead } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"
import { sendWhatsappMessageFromSession } from "@/lib/wahub"

/**
 * GET  — timeline pesan 1 percakapan (boleh dibuka siapa pun anggota tim).
 *        `limit` (maks 200, default 100) ambil pesan TERBARU; `beforeId` untuk load yang lebih lama.
 *        Reset `unreadCustomerCount` HANYA kalau yang buka = PIC lead.
 * POST — kirim balasan (OUTBOUND). Wajib PIC / SPV / Manager (`canActOnLead`) → 403 kalau bukan.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      leadId: true,
      unreadCustomerCount: true,
      whatsappConnectionId: true,
      lead: {
        select: {
          id: true,
          displayName: true,
          companyName: true,
          contactName: true,
          whatsappNumber: true,
          temperature: true,
          priorityLevel: true,
          outcome: true,
          currentActivityStage: true,
          segment: { select: { name: true } },
        },
      },
    },
  })
  if (!conversation) return NextResponse.json({ error: "Percakapan tidak ditemukan" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 100))
  const beforeId = searchParams.get("beforeId")

  let beforeFilter: { sentAt?: { lt: Date } } = {}
  if (beforeId) {
    const anchor = await prisma.message.findUnique({ where: { id: beforeId }, select: { sentAt: true } })
    if (anchor) beforeFilter = { sentAt: { lt: anchor.sentAt } }
  }

  const desc = await prisma.message.findMany({
    where: { conversationId: id, ...beforeFilter },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: MESSAGE_SELECT,
  })

  const activeAssignment = await prisma.leadAssignment.findFirst({
    where: { leadId: conversation.leadId, isActive: true },
    select: { assignedUser: { select: { id: true, name: true } } },
  })
  const canAct = await canActOnLead(user, conversation.leadId)

  if (activeAssignment?.assignedUser.id === user.id && conversation.unreadCustomerCount > 0) {
    await prisma.conversation.update({ where: { id }, data: { unreadCustomerCount: 0 } })
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      lead: {
        id: conversation.lead.id,
        displayName: conversation.lead.displayName,
        companyName: conversation.lead.companyName,
        contactName: conversation.lead.contactName,
        whatsappNumber: conversation.lead.whatsappNumber,
        temperature: conversation.lead.temperature,
        priorityLevel: conversation.lead.priorityLevel,
        outcome: conversation.lead.outcome,
        currentActivityStage: conversation.lead.currentActivityStage,
        segmentName: conversation.lead.segment?.name ?? null,
      },
      pic: activeAssignment?.assignedUser ?? null,
      canAct,
      hasWhatsappConnection: conversation.whatsappConnectionId != null,
    },
    messages: desc.reverse().map(messageDto),
    hasMoreOlder: desc.length === limit,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const payload = (await request.json().catch(() => null)) as { body?: unknown } | null
  const text = typeof payload?.body === "string" ? payload.body.trim() : ""
  if (!text) return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 })

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      leadId: true,
      lead: { select: { whatsappNumber: true } },
      whatsappConnection: { select: { wahubSessionId: true, status: true } },
    },
  })
  if (!conversation) return NextResponse.json({ error: "Percakapan tidak ditemukan" }, { status: 404 })

  if (!(await canActOnLead(user, conversation.leadId))) {
    return NextResponse.json(
      { error: "Kamu bukan PIC lead ini. Klik \"Ambil Alih\" dulu untuk bisa membalas." },
      { status: 403 },
    )
  }
  if (!conversation.whatsappConnection) {
    return NextResponse.json({ error: "Lead ini belum terhubung ke koneksi WhatsApp mana pun." }, { status: 400 })
  }

  const sentAt = new Date()
  try {
    await sendWhatsappMessageFromSession(
      conversation.whatsappConnection.wahubSessionId,
      conversation.lead.whatsappNumber,
      text,
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal mengirim ke WhatsApp" },
      { status: 502 },
    )
  }

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      direction: "OUTBOUND",
      messageType: "TEXT",
      body: text,
      senderUserId: user.id,
      sentAt,
      deliveryStatus: "SENT",
    },
    select: MESSAGE_SELECT,
  })

  await prisma.conversation.update({ where: { id }, data: { lastMessageAt: sentAt } })
  await prisma.lead.update({
    where: { id: conversation.leadId },
    data: { lastSalesMessageAt: sentAt, lastInteractionAt: sentAt },
  })
  await logAudit({
    actorUserId: user.id,
    action: "marketing.message.send",
    entityType: "conversation",
    entityId: id,
    metadata: { leadId: conversation.leadId },
  })

  return NextResponse.json({ message: messageDto(message) }, { status: 201 })
}
