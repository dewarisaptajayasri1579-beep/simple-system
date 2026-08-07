import type Anthropic from "@anthropic-ai/sdk"

import { runAgent } from "@/lib/agent"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber, sendWhatsappMessage } from "@/lib/wahub"

const THREAD_IDLE_MS = 30 * 60 * 1000

interface WahubIncomingMessage {
  from?: string
  senderNumber?: string
  to?: string
  body?: string
}

interface WahubWebhookPayload {
  sessionId?: string
  message?: WahubIncomingMessage
}

async function findRegisteredStaff(rawNumber: string) {
  const normalized = normalizePhoneNumber(rawNumber)
  const candidates = await prisma.user.findMany({ where: { phoneNumber: { not: null } } })
  return candidates.find((u) => normalizePhoneNumber(u.phoneNumber!) === normalized)
}

async function findRegisteredClient(rawNumber: string) {
  const normalized = normalizePhoneNumber(rawNumber)
  const candidates = await prisma.client.findMany({ where: { phoneNumber: { not: null } } })
  return candidates.find((c) => normalizePhoneNumber(c.phoneNumber!) === normalized)
}

async function getThread(senderType: "staff" | "client", userId?: string, clientId?: string) {
  return prisma.whatsappThread.findFirst({ where: { senderType, userId: userId ?? null, clientId: clientId ?? null } })
}

export async function handleWhatsappWebhook(payload: WahubWebhookPayload) {
  const message = payload.message
  if (!message?.from) return { skipped: "no message" }

  // WAHUB kirim webhook untuk pesan masuk MAUPUN keluar (termasuk balasan bot sendiri).
  // "to" cuma "me" kalau ini pesan yang benar-benar masuk dari orang lain.
  if (message.to !== "me") return { skipped: "outgoing message" }
  if (!message.body?.trim()) return { skipped: "empty body" }

  const command = message.body.trim()

  // Pesan dari WA Grup ops internal — "from" adalah JID grup ("...@g.us"), pengirim asli ada di
  // "senderNumber". Balasannya WAJIB ke grup itu sendiri, bukan DM pribadi ke pengirimnya, dan
  // cuma diproses kalau pengirimnya staf terdaftar (biar aman kalau suatu saat ada orang luar
  // masuk grup) — silent kalau tidak dikenal, sama seperti kebijakan nomor tak terdaftar di bawah.
  const groupJid = process.env.WAHUB_GROUP_JID
  if (groupJid && message.from === groupJid) {
    if (!message.senderNumber) return { skipped: "group message without senderNumber" }

    const staff = await findRegisteredStaff(message.senderNumber)
    if (!staff) return { skipped: "unregistered group sender" }

    const thread = await getThread("staff", staff.id)
    const isFresh = thread && Date.now() - thread.updatedAt.getTime() < THREAD_IDLE_MS
    const history = isFresh ? (thread!.history as unknown as Anthropic.MessageParam[]) : undefined

    const { reply, messages } = await runAgent({ mode: "staff", actorId: staff.id, command, history })

    if (thread) {
      await prisma.whatsappThread.update({ where: { id: thread.id }, data: { history: messages as unknown as object } })
    } else {
      await prisma.whatsappThread.create({ data: { senderType: "staff", userId: staff.id, history: messages as unknown as object } })
    }

    await sendWhatsappMessage(groupJid, reply)
    return { handled: true, actorType: "staff", name: staff.name, channel: "group" }
  }

  const digits = message.senderNumber || message.from.replace(/@.*$/, "")

  const staff = await findRegisteredStaff(digits)
  if (staff) {
    const thread = await getThread("staff", staff.id)
    const isFresh = thread && Date.now() - thread.updatedAt.getTime() < THREAD_IDLE_MS
    const history = isFresh ? (thread!.history as unknown as Anthropic.MessageParam[]) : undefined

    const { reply, messages } = await runAgent({ mode: "staff", actorId: staff.id, command, history })

    if (thread) {
      await prisma.whatsappThread.update({ where: { id: thread.id }, data: { history: messages as unknown as object } })
    } else {
      await prisma.whatsappThread.create({ data: { senderType: "staff", userId: staff.id, history: messages as unknown as object } })
    }

    await sendWhatsappMessage(digits, reply)
    return { handled: true, actorType: "staff", name: staff.name }
  }

  const client = await findRegisteredClient(digits)
  if (client) {
    const thread = await getThread("client", undefined, client.id)
    const isFresh = thread && Date.now() - thread.updatedAt.getTime() < THREAD_IDLE_MS
    const history = isFresh ? (thread!.history as unknown as Anthropic.MessageParam[]) : undefined

    const { reply, messages } = await runAgent({ mode: "client", actorId: client.id, command, history })

    if (thread) {
      await prisma.whatsappThread.update({ where: { id: thread.id }, data: { history: messages as unknown as object } })
    } else {
      await prisma.whatsappThread.create({ data: { senderType: "client", clientId: client.id, history: messages as unknown as object } })
    }

    await sendWhatsappMessage(digits, reply)
    return { handled: true, actorType: "client", name: client.name }
  }

  // Nomor tak dikenal: diam saja (hindari spam/bot-fishing & hemat kuota WA).
  return { skipped: "unregistered number" }
}
