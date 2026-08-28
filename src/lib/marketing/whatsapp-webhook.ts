import { createHash } from "node:crypto"

import { normalizePhoneNumber } from "@/lib/wahub"
import { prisma } from "@/lib/prisma"
import { analyzeLead } from "@/lib/marketing/ai"
import { createNotification } from "@/lib/marketing/notify"
import { findDuplicateLead } from "@/lib/marketing/duplicate"
import { publishMarketingEvent } from "@/lib/marketing/realtime"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { applyKeywordSegmentation } from "@/lib/marketing/segment-rules"

interface WahubIncomingMessage {
  id?: string
  from?: string
  senderNumber?: string
  senderName?: string
  chatId?: string
  to?: string
  body?: string
  /** Baileys ack: 1=pending 2=server(sent) 3=delivered 4=read 5=played */
  ack?: number
  type?: string // "text" | "image" | "document" | "audio" | "video" | ...
  mediaUrl?: string
  mimetype?: string
  caption?: string
  timestamp?: number
}

interface WahubWebhookPayload {
  sessionId?: string
  event?: string
  message?: WahubIncomingMessage
}

const MEDIA_TYPE_MAP: Record<string, string> = {
  image: "IMAGE",
  document: "DOCUMENT",
  audio: "AUDIO",
  ptt: "AUDIO",
  video: "OTHER",
  sticker: "OTHER",
}
const MEDIA_TYPES = new Set(Object.keys(MEDIA_TYPE_MAP))
// `type` yang dihitung sebagai pesan teks biasa. Selain ini & MEDIA_TYPES → event protokol/sistem
// (senderKeyDistributionMessage, protocolMessage, reactionMessage, pollUpdateMessage, dst) yang
// TIDAK boleh disimpan sebagai pesan (dulu ketang­kap jadi bubble "OTHER" kosong).
const TEXT_TYPES = new Set(["text", "chat", "conversation", "extendedTextMessage"])

/** Idempotency key stabil untuk 1 pesan — pakai `id` dari WAHUB kalau ada, kalau tidak
 *  sintetik dari (pengirim + timestamp + hash isi). */
function messageKey(m: WahubIncomingMessage, digits: string): string {
  if (m.id) return `wahub:${m.id}`
  const h = createHash("sha1").update(`${m.body ?? ""}|${m.mediaUrl ?? ""}`).digest("hex").slice(0, 12)
  return `wahub:${digits}:${m.timestamp ?? 0}:${h}`
}

/**
 * Ingest 1 event WhatsApp dari session Sales. Menangani:
 *  - pesan masuk (TEXT / media) → Lead / Conversation / Message (idempotent)
 *  - status/ack pesan keluar → update Message.deliveryStatus
 *  - raw event dicatat di LeadWebhookEvent untuk debug/idempotency
 */
export async function handleMarketingWhatsappWebhook(localSessionId: string, payload: WahubWebhookPayload) {
  const connection = await prisma.whatsappConnection.findUnique({ where: { wahubSessionId: localSessionId } })
  if (!connection) return { skipped: "unknown session" }

  const message = payload.message
  if (!message) return { skipped: "no message" }

  const digits = message.senderNumber || (message.from ? message.from.replace(/@.*$/, "") : "")
  const eventId = message.id ? `wahub:${message.id}` : `${localSessionId}:${digits}:${message.timestamp ?? Date.now()}:${message.ack ?? "m"}`

  // Raw log (best-effort, unik per event → retry provider tidak dobel proses).
  const logged = await prisma.leadWebhookEvent
    .create({
      data: {
        provider: "wahub",
        providerEventId: eventId,
        eventType: message.ack != null ? "status" : "message",
        payload: payload as object,
      },
    })
    .then(() => true)
    .catch(() => false) // P2002 = sudah pernah diproses

  if (!logged) return { skipped: "duplicate event" }

  // ---- Status / ack pesan keluar ----
  if (message.ack != null && message.to !== "me") {
    const status = message.ack >= 4 ? "READ" : message.ack === 3 ? "DELIVERED" : message.ack === 2 ? "SENT" : null
    if (status && message.id) {
      await prisma.message.updateMany({ where: { providerMessageId: `wahub:${message.id}` }, data: { deliveryStatus: status } })
    }
    await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "PROCESSED" } })
    return { handled: true, statusUpdate: status }
  }

  // ---- Pesan masuk ----
  if (!message.from) return { skipped: "no from" }
  if (message.to !== "me") return { skipped: "outgoing message" }

  const chatId = message.chatId || message.from
  if (chatId.endsWith("@g.us")) return { skipped: "group message" }

  // Whitelist tipe: teks / media dikenal. Selain itu = event protokol → abaikan total.
  const isText = !message.type || TEXT_TYPES.has(message.type)
  const isMedia = !!message.type && MEDIA_TYPES.has(message.type)
  if (!isText && !isMedia) {
    console.log(`[mkt-wa] abaikan event tipe "${message.type}" dari ${digits}`)
    await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "IGNORED" } })
    return { skipped: `ignored type: ${message.type}` }
  }

  const messageType = isMedia ? MEDIA_TYPE_MAP[message.type!] ?? "OTHER" : "TEXT"
  const bodyText = isMedia ? message.caption?.trim() || null : message.body?.trim() || null
  if (!isMedia && !bodyText) return { skipped: "empty body" }
  if (isMedia && !message.mediaUrl && !bodyText) return { skipped: "empty media" }

  const whatsappNumber = normalizePhoneNumber(digits)
  const sentAt = message.timestamp ? new Date(message.timestamp * 1000) : new Date()
  const providerMessageId = messageKey(message, digits)

  // Idempotency di level pesan.
  const existing = await prisma.message.findUnique({ where: { providerMessageId }, select: { id: true } })
  if (existing) {
    await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "PROCESSED" } })
    return { skipped: "duplicate message" }
  }

  const dup = await findDuplicateLead(whatsappNumber)
  let leadId: string
  let leadName: string
  let isNewLead = false
  if (dup) {
    leadId = dup.leadId
    leadName = dup.displayName
    // Lead WON/LOST yang recent dihubungi lagi → buka kembali (docs §27).
    if (dup.outcome !== "OPEN") {
      await prisma.lead.update({
        where: { id: leadId },
        data: { outcome: "OPEN", wonAt: null, lostAt: null, lostReasonId: null, dealValue: null, wonNote: null },
      })
    }
  } else {
    const source = await prisma.leadSource.findUnique({ where: { code: "WHATSAPP" } })
    const lead = await prisma.lead.create({
      data: {
        displayName: message.senderName || whatsappNumber,
        whatsappNumber,
        sourceId: source?.id,
        firstContactAt: sentAt,
      },
    })
    await prisma.leadAssignment.create({
      data: { leadId: lead.id, assignedUserId: connection.userId, assignmentType: "PRIMARY" },
    })
    leadId = lead.id
    leadName = lead.displayName
    isNewLead = true
  }

  const providerConversationId = `${connection.wahubSessionId}:${chatId}`
  let conversation = await prisma.conversation.findUnique({
    where: { provider_providerConversationId: { provider: "wahub", providerConversationId } },
  })
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        leadId,
        whatsappConnectionId: connection.id,
        provider: "wahub",
        providerConversationId,
        channel: "WHATSAPP",
      },
    })
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      providerMessageId,
      direction: "INBOUND",
      messageType,
      body: bodyText,
      mediaUrl: message.mediaUrl ?? null,
      senderExternalId: digits,
      sentAt,
      deliveryStatus: "DELIVERED",
      rawProviderPayload: message as object,
    },
  })

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: sentAt, unreadCustomerCount: { increment: 1 } },
  })

  // Dorong ke koneksi SSE yang lagi ditahan browser tim — inbox/percakapan update seketika.
  publishMarketingEvent({
    type: "message",
    conversationId: conversation.id,
    leadId,
    direction: "INBOUND",
    at: sentAt.toISOString(),
  })
  await prisma.lead.update({
    where: { id: leadId },
    data: { lastCustomerMessageAt: sentAt, lastInteractionAt: sentAt },
  })

  await recalcLeadDerived(leadId).catch(() => {})

  // Auto-segmentasi deterministik dari keyword pesan — dijalankan SEBELUM AI supaya menang.
  // Berlaku untuk lead baru maupun lead lama yang belum punya segmen; tidak menimpa yang sudah ada.
  await applyKeywordSegmentation(leadId, bodyText).catch(() => null)

  // Analisa AI untuk lead baru (docs §9.1) — fire-and-forget, non-blocking. Segmen sudah keburu
  // di-set keyword di atas → guard "belum bersegmen" di analyzeLead otomatis skip auto-apply segmen.
  if (isNewLead) void analyzeLead(leadId).catch(() => {})

  const pic = await prisma.leadAssignment.findFirst({
    where: { leadId, isActive: true },
    select: { assignedUserId: true },
  })
  if (pic) {
    await createNotification({
      userId: pic.assignedUserId,
      type: "NEW_CUSTOMER_MESSAGE",
      title: `Pesan baru: ${leadName}`,
      body: bodyText?.slice(0, 120) || `[${messageType.toLowerCase()}]`,
      entityType: "conversation",
      entityId: conversation.id,
      deepLink: `/marketing/inbox/${conversation.id}`,
      dedupeKey: `newmsg:${conversation.id}:${sentAt.toISOString().slice(0, 16)}`,
    }).catch(() => {})
  }

  await prisma.leadWebhookEvent.updateMany({
    where: { providerEventId: eventId },
    data: { processedAt: new Date(), processingStatus: "PROCESSED" },
  })

  return { handled: true, leadId, conversationId: conversation.id, isNewLead }
}
