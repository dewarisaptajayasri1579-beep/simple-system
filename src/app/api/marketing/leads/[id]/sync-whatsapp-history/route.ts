import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { prisma } from "@/lib/prisma"
import { fetchChatHistoryFromSession, normalizePhoneNumber } from "@/lib/wahub"

/** POST /api/marketing/leads/[id]/sync-whatsapp-history — tarik riwayat chat WhatsApp yang
 *  MEMANG SUDAH ADA di WhatsApp pemanggil (session WAHUB miliknya sendiri) buat lead ini, lalu
 *  simpan sebagai Message (dan bikin Conversation kalau lead ini belum punya sama sekali — lead
 *  yang ditambah manual TIDAK otomatis punya Conversation, lihat POST /api/marketing/leads).
 *  Array kosong dari WAHUB = memang tidak ada riwayat sebelumnya, bukan error. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true, whatsappNumber: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  if (!(await canActOnLead(user, id))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  const connection = await prisma.whatsappConnection.findFirst({
    where: { userId: user.id, status: "READY" },
    select: { id: true, wahubSessionId: true },
  })
  if (!connection) {
    return NextResponse.json(
      { error: "Kamu belum hubungkan WhatsApp — sambungkan dulu di Marketing > WhatsApp." },
      { status: 400 },
    )
  }

  const jid = `${normalizePhoneNumber(lead.whatsappNumber)}@s.whatsapp.net`
  const providerConversationId = `${connection.wahubSessionId}:${jid}`

  let conversation = await prisma.conversation.findUnique({
    where: { provider_providerConversationId: { provider: "wahub", providerConversationId } },
  })
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { leadId: id, whatsappConnectionId: connection.id, provider: "wahub", providerConversationId, channel: "WHATSAPP" },
    })
  }

  let history: { id: string; fromMe: boolean; body: string; timestamp: number }[] = []
  try {
    const res = await fetchChatHistoryFromSession(connection.wahubSessionId, lead.whatsappNumber, 50)
    history = res.messages ?? []
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal ambil riwayat chat dari WAHUB" },
      { status: 502 },
    )
  }

  let syncedCount = 0
  let latestSentAt = conversation.lastMessageAt
  if (history.length > 0) {
    const created = await prisma.message.createMany({
      skipDuplicates: true,
      data: history.map((m) => ({
        conversationId: conversation!.id,
        providerMessageId: m.id,
        direction: m.fromMe ? "OUTBOUND" : "INBOUND",
        messageType: "TEXT",
        body: m.body,
        senderUserId: m.fromMe ? user.id : null,
        senderExternalId: m.fromMe ? null : normalizePhoneNumber(lead.whatsappNumber),
        sentAt: new Date(m.timestamp * 1000),
        deliveryStatus: "DELIVERED",
      })),
    })
    syncedCount = created.count
    const newest = history[history.length - 1]
    const newestSentAt = new Date(newest.timestamp * 1000)
    if (!latestSentAt || newestSentAt > latestSentAt) latestSentAt = newestSentAt
  }

  if (latestSentAt && latestSentAt !== conversation.lastMessageAt) {
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: latestSentAt } })
  }

  if (syncedCount > 0) {
    await recalcLeadDerived(id).catch(() => {})
  }
  await logAudit({
    actorUserId: user.id,
    action: "marketing.conversation.syncHistory",
    entityType: "conversation",
    entityId: conversation.id,
    metadata: { leadId: id, syncedCount },
  })

  return NextResponse.json({ conversationId: conversation.id, syncedCount })
}
