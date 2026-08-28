import { createHash } from "node:crypto"

import { normalizePhoneNumber } from "@/lib/wahub"
import { prisma } from "@/lib/prisma"
import { analyzeLead } from "@/lib/marketing/ai"
import { createNotification } from "@/lib/marketing/notify"
import { findDuplicateLead } from "@/lib/marketing/duplicate"
import { publishMarketingEvent } from "@/lib/marketing/realtime"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { applyKeywordSegmentation } from "@/lib/marketing/segment-rules"
import { ensureAutoFollowUp } from "@/lib/marketing/auto-follow-up"

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
  /** Presence customer: "composing" (mengetik) / "recording" / "available" / "paused" / dst.
   *  WAHUB harus subscribe presence & forward event ini — kalau tidak, indikator "mengetik"
   *  tidak akan muncul (tidak error, cuma tidak ada). */
  presence?: string
  type?: string // "conversation" | "extendedTextMessage" | "image" | "senderKeyDistributionMessage" | ...
  mediaUrl?: string
  mimetype?: string
  caption?: string
  hasMedia?: boolean
  isGroup?: boolean
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

/**
 * Klasifikasi 1 event WAHUB berdasarkan ISI-nya, bukan label `type` (WAHUB kadang kasih
 * `type: "senderKeyDistributionMessage"` padahal ada teks nyata; sebaliknya event protokol
 * murni tidak punya isi apa pun). `skip` = event sistem → jangan disimpan sebagai pesan.
 */
function classifyMessage(m: WahubIncomingMessage): {
  kind: "text" | "media" | "skip"
  messageType: string
  body: string | null
} {
  const body = m.body?.trim() || null
  const caption = m.caption?.trim() || null
  const isMedia = (!!m.type && MEDIA_TYPES.has(m.type)) || m.hasMedia === true || !!m.mediaUrl
  if (isMedia) {
    return { kind: "media", messageType: (m.type && MEDIA_TYPE_MAP[m.type]) || "OTHER", body: caption ?? body }
  }
  if (body) return { kind: "text", messageType: "TEXT", body }
  return { kind: "skip", messageType: "TEXT", body: null }
}

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

  // ---- Presence customer (sedang mengetik) — event ringan, tidak disimpan ke DB ----
  const presence = (message.presence || (payload.event?.includes("presence") ? "composing" : "")).toLowerCase()
  if (presence) {
    if (presence === "composing" || presence === "recording") {
      const pChatId = message.chatId || message.from || ""
      if (pChatId && !pChatId.endsWith("@g.us")) {
        const conv = await prisma.conversation.findUnique({
          where: {
            provider_providerConversationId: {
              provider: "wahub",
              providerConversationId: `${connection.wahubSessionId}:${pChatId}`,
            },
          },
          select: { id: true },
        })
        if (conv) publishMarketingEvent({ type: "typing", conversationId: conv.id, at: new Date().toISOString() })
      }
    }
    return { handled: true, presence }
  }

  const digits = message.senderNumber || (message.from ? message.from.replace(/@.*$/, "") : "")
  // Untuk event STATUS/ack, satu pesan keluar memicu beberapa update (sent→delivered→read).
  // Kalau eventId cuma `wahub:<id>`, ack ke-2 dst. kena P2002 dan ditolak sebagai "duplikat" —
  // makanya di sini di-suffix dengan nilai ack-nya supaya tiap transisi bisa masuk.
  const eventId =
    message.ack != null && message.id
      ? `wahub:${message.id}:ack${message.ack}`
      : message.id
        ? `wahub:${message.id}`
        : `${localSessionId}:${digits}:${message.timestamp ?? Date.now()}:${message.ack ?? "m"}`

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
      const pmid = `wahub:${message.id}`
      const hit = await prisma.message.findUnique({
        where: { providerMessageId: pmid },
        select: { conversationId: true, deliveryStatus: true },
      })
      // Jangan mundur: ack "delivered" yang telat datang setelah "read" tidak boleh menimpa.
      const RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 }
      if (hit && (RANK[status] ?? 0) > (RANK[hit.deliveryStatus] ?? 0)) {
        await prisma.message.update({ where: { providerMessageId: pmid }, data: { deliveryStatus: status } })
        publishMarketingEvent({
          type: "status",
          conversationId: hit.conversationId,
          providerMessageId: pmid,
          status,
          at: new Date().toISOString(),
        })
      }
    }
    await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "PROCESSED" } })
    return { handled: true, statusUpdate: status }
  }

  if (!message.from) return { skipped: "no from" }

  // ---- Balasan Sales yang dikirim LANGSUNG dari WhatsApp-nya (bukan lewat app ini) ----
  // WAHUB tetap kirim webhook untuk pesan KELUAR sesi ini. Kalau app yang mengirim, baris Message
  // OUTBOUND sudah dibuat di route kirim → di sini cukup backfill `providerMessageId` (anti-dobel).
  // Kalau Sales balas dari HP-nya sendiri, baris itu belum ada → dibuat sekarang supaya tetap
  // tercatat di percakapan & KPI (lastSalesMessageAt).
  if (message.to !== "me") {
    if (message.isGroup || message.chatId?.endsWith("@g.us") || message.from?.endsWith("@g.us")) {
      return { skipped: "outgoing group message" }
    }
    const clsOut = classifyMessage(message)
    if (clsOut.kind === "skip") {
      await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "IGNORED" } })
      return { skipped: `outgoing tanpa isi (type: ${message.type})` }
    }
    const outBody = clsOut.body

    // Nomor lawan bicara (customer) = `senderNumber` / `from` (nomor asli, konsisten kedua arah).
    // `to`/`chatId` untuk pesan KELUAR sering "xxxx@lid" (alias privasi WhatsApp), bukan nomor.
    const remoteDigits = (message.senderNumber || message.from || "").replace(/@.*$/, "")
    const hasRealNumber = /^\d{6,}$/.test(remoteDigits)
    const lidJid = message.chatId?.endsWith("@lid")
      ? message.chatId
      : message.to?.endsWith("@lid")
        ? message.to
        : null

    const outMsgId = messageKey(message, remoteDigits)
    const dupOut = await prisma.message.findUnique({ where: { providerMessageId: outMsgId }, select: { id: true } })
    if (dupOut) {
      await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "PROCESSED" } })
      return { skipped: "duplicate outgoing message" }
    }

    const outSentAt = message.timestamp ? new Date(message.timestamp * 1000) : new Date()
    const outConvKey = `${connection.wahubSessionId}:${message.chatId || message.from || remoteDigits}`
    const convSelect = { id: true, leadId: true, lidJid: true } as const

    // Cari conversation: (1) key provider, (2) lidJid yang pernah direkam, (3) via lead dari nomor asli.
    let outConv =
      (await prisma.conversation.findUnique({
        where: { provider_providerConversationId: { provider: "wahub", providerConversationId: outConvKey } },
        select: convSelect,
      })) ||
      (lidJid
        ? await prisma.conversation.findFirst({
            where: { provider: "wahub", lidJid, whatsappConnectionId: connection.id },
            select: convSelect,
          })
        : null)

    let outLeadId = outConv?.leadId ?? null
    if (!outLeadId && hasRealNumber) {
      const l = await prisma.lead.findFirst({ where: { whatsappNumber: normalizePhoneNumber(remoteDigits) }, select: { id: true } })
      outLeadId = l?.id ?? null
      if (outLeadId && !outConv) {
        outConv = await prisma.conversation.findFirst({
          where: { leadId: outLeadId, whatsappConnectionId: connection.id },
          orderBy: { createdAt: "desc" },
          select: convSelect,
        })
      }
    }
    if (!outLeadId) {
      // Bukan lead dikenal & tidak ada jejak lidJid → jangan auto-bikin lead dari pesan keluar.
      await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "IGNORED" } })
      return { skipped: "outgoing ke non-lead" }
    }

    if (!outConv) {
      outConv = await prisma.conversation.create({
        data: { leadId: outLeadId, whatsappConnectionId: connection.id, provider: "wahub", providerConversationId: outConvKey, channel: "WHATSAPP", lidJid },
        select: convSelect,
      })
    } else if (lidJid && !outConv.lidJid) {
      await prisma.conversation.update({ where: { id: outConv.id }, data: { lidJid } })
    }

    // Pesan yang dikirim lewat app ini (< 2 menit lalu, providerMessageId masih null) → backfill
    // id-nya, jangan bikin baris baru.
    let appSent: { id: string } | null = null
    if (outBody || message.mediaUrl) {
      appSent = await prisma.message.findFirst({
        where: {
          conversationId: outConv.id,
          direction: "OUTBOUND",
          providerMessageId: null,
          sentAt: { gte: new Date(outSentAt.getTime() - 120_000) },
          ...(outBody ? { body: outBody } : { mediaUrl: message.mediaUrl }),
        },
        orderBy: { sentAt: "desc" },
        select: { id: true },
      })
    }
    if (appSent) {
      await prisma.message.update({ where: { id: appSent.id }, data: { providerMessageId: outMsgId } })
      await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "PROCESSED" } })
      return { skipped: "outgoing sudah dicatat app", backfilled: appSent.id }
    }

    await prisma.message.create({
      data: {
        conversationId: outConv.id,
        providerMessageId: outMsgId,
        direction: "OUTBOUND",
        messageType: clsOut.messageType,
        body: outBody,
        mediaUrl: message.mediaUrl ?? null,
        senderUserId: connection.userId, // dikirim dari HP Sales pemilik sesi
        sentAt: outSentAt,
        deliveryStatus: "SENT",
        rawProviderPayload: message as object,
      },
    })
    await prisma.conversation.update({ where: { id: outConv.id }, data: { lastMessageAt: outSentAt } })
    await prisma.lead.update({
      where: { id: outLeadId },
      data: { lastSalesMessageAt: outSentAt, lastInteractionAt: outSentAt, waGroupAlertedAt: null },
    })
    publishMarketingEvent({ type: "message", conversationId: outConv.id, leadId: outLeadId, direction: "OUTBOUND", at: outSentAt.toISOString() })
    await recalcLeadDerived(outLeadId).catch(() => {})
    await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "PROCESSED" } })
    console.log(`[mkt-wa] balasan Sales dari HP tercatat → lead ${outLeadId}`)
    return { handled: true, outbound: true, conversationId: outConv.id, leadId: outLeadId }
  }

  // ---- Pesan masuk ----
  const chatId = message.chatId || message.from
  if (chatId.endsWith("@g.us")) return { skipped: "group message" }

  // Klasifikasi by ISI, bukan label `type` — event protokol tanpa isi diabaikan.
  const cls = classifyMessage(message)
  if (cls.kind === "skip") {
    await prisma.leadWebhookEvent.updateMany({ where: { providerEventId: eventId }, data: { processedAt: new Date(), processingStatus: "IGNORED" } })
    return { skipped: `tanpa isi (type: ${message.type})` }
  }
  const messageType = cls.messageType
  const bodyText = cls.body
  if (cls.kind === "media" && !message.mediaUrl && !bodyText) return { skipped: "empty media" }

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
  const inLidJid = chatId.endsWith("@lid") ? chatId : null
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
        lidJid: inLidJid,
      },
    })
  } else if (inLidJid && !conversation.lidJid) {
    conversation = await prisma.conversation.update({ where: { id: conversation.id }, data: { lidJid: inLidJid } })
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

  // Auto-jadwal follow up (skip kalau sudah ada FU OPEN / fitur off / lead bukan OPEN).
  await ensureAutoFollowUp(leadId, {
    from: sentAt,
    purpose: isNewLead ? "Follow up lead baru" : "Balas / tindak lanjut pesan customer",
    reason: isNewLead ? "lead baru masuk" : "pesan customer belum ada follow up",
    createdByUserId: connection.userId,
  }).catch(() => null)

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
