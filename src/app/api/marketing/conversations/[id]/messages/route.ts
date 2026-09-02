import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { MESSAGE_SELECT, messageDto } from "@/lib/marketing/inbox"
import { closeWebPushNotification } from "@/lib/marketing/notify"
import { canActOnLead, resolveMarketingRole } from "@/lib/marketing/permissions"
import { publishMarketingEvent } from "@/lib/marketing/realtime"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { prisma } from "@/lib/prisma"
import { extractWahubMessageId, sendWhatsappMediaFromSession, sendWhatsappMessageFromSession } from "@/lib/wahub"

/**
 * GET  — timeline pesan 1 percakapan. Role SALES cuma boleh buka percakapan lead yang dia
 *        PIC-nya (404 kalau bukan) — Manager/SPV tetap transparan lihat semua.
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
      whatsappConnection: { select: { status: true, label: true, phoneNumber: true } },
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
          segment: { select: { id: true, name: true } },
        },
      },
    },
  })
  if (!conversation) return NextResponse.json({ error: "Percakapan tidak ditemukan" }, { status: 404 })

  const marketingRole = await resolveMarketingRole(user.id, user.role)
  if (marketingRole === "SALES") {
    const assigned = await prisma.leadAssignment.findFirst({
      where: { leadId: conversation.leadId, assignedUserId: user.id, isActive: true },
      select: { id: true },
    })
    if (!assigned) return NextResponse.json({ error: "Percakapan tidak ditemukan" }, { status: 404 })
  }

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
  // Follow up OPEN gampang kelewat kalau Sales cuma balas chat dari Inbox tanpa buka Detail
  // Lead — balas chat TIDAK otomatis menutup follow up (lihat komentar sama di LeadDetailClient),
  // jadi ditampilkan di sini juga supaya ada nudge buat "Selesaikan".
  const openFollowUp = await prisma.leadFollowUp.findFirst({
    where: { leadId: conversation.leadId, status: "OPEN" },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, purpose: true, scheduledAt: true },
  })

  if (activeAssignment?.assignedUser.id === user.id && conversation.unreadCustomerCount > 0) {
    await prisma.conversation.update({ where: { id }, data: { unreadCustomerCount: 0 } })
  }

  // Buka detail percakapan = sudah dibaca → hilangkan notifikasi lonceng milik user ini yang
  // menunjuk ke percakapan ini (pesan baru, dsb). Emit event supaya lonceng ikut update realtime.
  const cleared = await prisma.leadNotification.updateMany({
    where: { userId: user.id, entityType: "conversation", entityId: id, readAt: null },
    data: { readAt: new Date(), status: "READ" },
  })
  if (cleared.count > 0) {
    publishMarketingEvent({ type: "notification", userId: user.id, at: new Date().toISOString() })
    // Notif Android/browser bertag percakapan ini mungkin masih nongkrong di tray device lain
    // (atau device ini sendiri kalau dibuka dari Inbox, bukan tap notifikasinya) — tutup proaktif.
    void closeWebPushNotification(user.id, `conversation:${id}`).catch(() => {})
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
        segmentId: conversation.lead.segment?.id ?? null,
        segmentName: conversation.lead.segment?.name ?? null,
      },
      pic: activeAssignment?.assignedUser ?? null,
      canAct,
      openFollowUp: openFollowUp
        ? { id: openFollowUp.id, purpose: openFollowUp.purpose, scheduledAt: openFollowUp.scheduledAt.toISOString() }
        : null,
      hasWhatsappConnection: conversation.whatsappConnectionId != null,
      // Status koneksi WA yang dipakai percakapan ini (null = belum tertaut ke koneksi mana pun).
      whatsappStatus: conversation.whatsappConnection?.status ?? null,
      whatsappConnected: conversation.whatsappConnection?.status === "READY",
      whatsappConnectionLabel: conversation.whatsappConnection?.label ?? conversation.whatsappConnection?.phoneNumber ?? null,
    },
    messages: desc.reverse().map(messageDto),
    hasMoreOlder: desc.length === limit,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const payload = (await request.json().catch(() => null)) as
    | { body?: unknown; aiSuggestionId?: unknown; mediaUrl?: unknown; messageType?: unknown }
    | null
  const text = typeof payload?.body === "string" ? payload.body.trim() : ""
  const aiSuggestionId = typeof payload?.aiSuggestionId === "string" ? payload.aiSuggestionId : null
  const mediaUrl = typeof payload?.mediaUrl === "string" && /^https?:\/\//.test(payload.mediaUrl) ? payload.mediaUrl : null
  const ALLOWED_MEDIA_TYPES = new Set(["IMAGE", "DOCUMENT", "AUDIO", "OTHER"])
  const mediaMessageType =
    typeof payload?.messageType === "string" && ALLOWED_MEDIA_TYPES.has(payload.messageType) ? payload.messageType : "OTHER"
  if (!text && !mediaUrl) return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 })

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
  const session = conversation.whatsappConnection.wahubSessionId
  const number = conversation.lead.whatsappNumber
  let wahubMessageId: string | null = null
  try {
    const result = mediaUrl
      ? await sendWhatsappMediaFromSession(session, number, mediaUrl, text || undefined)
      : await sendWhatsappMessageFromSession(session, number, text)
    wahubMessageId = extractWahubMessageId(result)
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
      messageType: mediaUrl ? mediaMessageType : "TEXT",
      body: text || null,
      mediaUrl: mediaUrl ?? undefined,
      senderUserId: user.id,
      aiSuggestionId: aiSuggestionId ?? undefined,
      // id dari WAHUB dipakai untuk mencocokkan ack status (SENT/DELIVERED/READ) dari webhook.
      providerMessageId: wahubMessageId ? `wahub:${wahubMessageId}` : undefined,
      sentAt,
      deliveryStatus: "SENT",
    },
    select: MESSAGE_SELECT,
  })

  if (aiSuggestionId) {
    await prisma.leadAiSuggestion
      .updateMany({ where: { id: aiSuggestionId, usedAt: null }, data: { usedAt: sentAt, usedByUserId: user.id } })
      .catch(() => {})
  }

  await prisma.conversation.update({ where: { id }, data: { lastMessageAt: sentAt } })
  publishMarketingEvent({
    type: "message",
    conversationId: id,
    leadId: conversation.leadId,
    direction: "OUTBOUND",
    at: sentAt.toISOString(),
  })
  await prisma.lead.update({
    where: { id: conversation.leadId },
    // waGroupAlertedAt di-reset: kalau nanti customer chat lagi & didiamkan, boleh di-alert ulang.
    data: { lastSalesMessageAt: sentAt, lastInteractionAt: sentAt, lastChatAt: sentAt, waGroupAlertedAt: null },
  })
  await recalcLeadDerived(conversation.leadId).catch(() => {})
  await logAudit({
    actorUserId: user.id,
    action: "marketing.message.send",
    entityType: "conversation",
    entityId: id,
    metadata: { leadId: conversation.leadId },
  })

  return NextResponse.json({ message: messageDto(message) }, { status: 201 })
}
