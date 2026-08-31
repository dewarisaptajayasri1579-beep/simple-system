import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { GROUP_MESSAGE_SELECT, groupMessageDto } from "@/lib/marketing/groups"
import { canActOnGroup } from "@/lib/marketing/permissions"
import { publishMarketingEvent } from "@/lib/marketing/realtime"
import { prisma } from "@/lib/prisma"
import { extractWahubMessageId, sendWhatsappMediaFromSession, sendWhatsappMessageFromSession } from "@/lib/wahub"

/**
 * GET  — timeline pesan 1 Grup WA. `limit` (maks 200, default 100) ambil pesan TERBARU;
 *        `beforeId` untuk load yang lebih lama. Reset `unreadCount` tiap dibuka.
 * POST — kirim balasan ke grup. Wajib pemilik WhatsappConnection grup itu / SPV / Manager.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  if (!(await canActOnGroup(user, id))) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  const group = await prisma.groupChat.findUnique({
    where: { id },
    select: {
      id: true,
      groupJid: true,
      name: true,
      whatsappConnection: { select: { wahubSessionId: true, status: true, label: true, phoneNumber: true } },
    },
  })
  if (!group) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 100))
  const beforeId = searchParams.get("beforeId")

  let beforeFilter: { sentAt?: { lt: Date } } = {}
  if (beforeId) {
    const anchor = await prisma.groupMessage.findUnique({ where: { id: beforeId }, select: { sentAt: true } })
    if (anchor) beforeFilter = { sentAt: { lt: anchor.sentAt } }
  }

  const desc = await prisma.groupMessage.findMany({
    where: { groupChatId: id, ...beforeFilter },
    orderBy: { sentAt: "desc" },
    take: limit,
    select: GROUP_MESSAGE_SELECT,
  })

  await prisma.groupChat.update({ where: { id }, data: { unreadCount: 0 } })

  return NextResponse.json({
    group: {
      id: group.id,
      name: group.name || `Grup ${group.groupJid.split("@")[0].slice(-4)}`,
      whatsappStatus: group.whatsappConnection.status,
      whatsappConnected: group.whatsappConnection.status === "READY",
      whatsappConnectionLabel: group.whatsappConnection.label ?? group.whatsappConnection.phoneNumber ?? null,
    },
    messages: desc.reverse().map(groupMessageDto),
    hasMoreOlder: desc.length === limit,
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  if (!(await canActOnGroup(user, id))) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  const payload = (await request.json().catch(() => null)) as
    | { body?: unknown; mediaUrl?: unknown; messageType?: unknown }
    | null
  const text = typeof payload?.body === "string" ? payload.body.trim() : ""
  const mediaUrl = typeof payload?.mediaUrl === "string" && /^https?:\/\//.test(payload.mediaUrl) ? payload.mediaUrl : null
  const ALLOWED_MEDIA_TYPES = new Set(["IMAGE", "DOCUMENT", "AUDIO", "OTHER"])
  const mediaMessageType =
    typeof payload?.messageType === "string" && ALLOWED_MEDIA_TYPES.has(payload.messageType) ? payload.messageType : "OTHER"
  if (!text && !mediaUrl) return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 })

  const group = await prisma.groupChat.findUnique({
    where: { id },
    select: { groupJid: true, whatsappConnection: { select: { wahubSessionId: true, status: true, userId: true } } },
  })
  if (!group) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 })

  const sentAt = new Date()
  let wahubMessageId: string | null = null
  try {
    const result = mediaUrl
      ? await sendWhatsappMediaFromSession(group.whatsappConnection.wahubSessionId, group.groupJid, mediaUrl, text || undefined)
      : await sendWhatsappMessageFromSession(group.whatsappConnection.wahubSessionId, group.groupJid, text)
    wahubMessageId = extractWahubMessageId(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal mengirim ke WhatsApp" }, { status: 502 })
  }

  const message = await prisma.groupMessage.create({
    data: {
      groupChatId: id,
      direction: "OUTBOUND",
      messageType: mediaUrl ? mediaMessageType : "TEXT",
      body: text || null,
      mediaUrl: mediaUrl ?? undefined,
      senderUserId: user.id,
      providerMessageId: wahubMessageId ? `wahub:${wahubMessageId}` : undefined,
      sentAt,
    },
    select: GROUP_MESSAGE_SELECT,
  })

  await prisma.groupChat.update({ where: { id }, data: { lastMessageAt: sentAt } })
  publishMarketingEvent({
    type: "group_message",
    groupChatId: id,
    connectionUserId: group.whatsappConnection.userId,
    direction: "OUTBOUND",
    at: sentAt.toISOString(),
  })

  return NextResponse.json({ message: groupMessageDto(message) })
}
