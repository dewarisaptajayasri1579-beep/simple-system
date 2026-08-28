import { normalizePhoneNumber } from "@/lib/wahub"
import { prisma } from "@/lib/prisma"
import { recalcLeadPriority } from "@/lib/marketing/priority"

interface WahubIncomingMessage {
  from?: string
  senderNumber?: string
  senderName?: string
  /** JID chat asal pesan — beda dari "from" kalau grup ("from" sudah di-resolve ke pengirimnya).
   *  Grup selalu berakhiran "@g.us", diabaikan di sini (Simple Lead cuma urus chat 1:1). */
  chatId?: string
  to?: string
  body?: string
  timestamp?: number
}

interface WahubWebhookPayload {
  sessionId?: string
  message?: WahubIncomingMessage
}

/** Ingest 1 pesan WhatsApp masuk dari session Sales tertentu jadi Lead/Conversation/Message.
 *  `localSessionId` = bagian lokal sessionId (query param `session`, sama dengan
 *  WhatsappConnection.wahubSessionId) — dipakai cari pemilik koneksi ini, BUKAN payload.sessionId
 *  (itu versi sudah di-prefix WAHUB, lihat docs/04-database.md §11.1).
 *
 *  Auto-segmentasi AI (docs §9.1) belum diimplementasi di sini — segmentId sengaja dibiarkan null
 *  saat lead baru dibuat, menyusul di fase AI Analysis. */
export async function handleMarketingWhatsappWebhook(localSessionId: string, payload: WahubWebhookPayload) {
  const connection = await prisma.whatsappConnection.findUnique({ where: { wahubSessionId: localSessionId } })
  if (!connection) return { skipped: "unknown session" }

  const message = payload.message
  if (!message?.from) return { skipped: "no message" }
  if (message.to !== "me") return { skipped: "outgoing message" }
  if (!message.body?.trim()) return { skipped: "empty body" }

  const chatId = message.chatId || message.from
  if (chatId.endsWith("@g.us")) return { skipped: "group message" }

  const digits = message.senderNumber || message.from.replace(/@.*$/, "")
  const whatsappNumber = normalizePhoneNumber(digits)
  const sentAt = message.timestamp ? new Date(message.timestamp * 1000) : new Date()

  let lead = await prisma.lead.findFirst({ where: { whatsappNumber } })
  if (!lead) {
    const source = await prisma.leadSource.findUnique({ where: { code: "WHATSAPP" } })
    lead = await prisma.lead.create({
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
  }

  // providerConversationId di-namespace per session (bukan cuma chatId polos) — customer yang
  // sama bisa punya JID identik ke lebih dari 1 nomor Sales (2 conversation berbeda), jadi
  // (provider, providerConversationId) globalnya harus tetap unik per session.
  const providerConversationId = `${connection.wahubSessionId}:${chatId}`

  let conversation = await prisma.conversation.findUnique({
    where: { provider_providerConversationId: { provider: "wahub", providerConversationId } },
  })
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        leadId: lead.id,
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
      direction: "INBOUND",
      messageType: "TEXT",
      body: message.body,
      senderExternalId: digits,
      sentAt,
      deliveryStatus: "DELIVERED",
    },
  })

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: sentAt, unreadCustomerCount: { increment: 1 } },
  })

  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastCustomerMessageAt: sentAt, lastInteractionAt: sentAt },
  })

  await recalcLeadPriority(lead.id).catch(() => {})

  return { handled: true, leadId: lead.id, conversationId: conversation.id }
}
