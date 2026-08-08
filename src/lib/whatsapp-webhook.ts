import type Anthropic from "@anthropic-ai/sdk"

import { runAgent } from "@/lib/agent"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber, sendWhatsappMessage } from "@/lib/wahub"

const THREAD_IDLE_MS = 30 * 60 * 1000
/** Di grup, sekali Naya jawab seseorang, pesan BERIKUTNYA dari orang yang sama dalam jendela ini
 *  dianggap masih nyambung ke jawaban itu — tidak perlu ulang ketik "Naya," lagi. Sengaja dibikin
 *  pendek (bukan sama dengan THREAD_IDLE_MS) supaya obrolan biasa antar-orang di grup setelah lewat
 *  dari 2 menit tidak keliru dianggap masih ngobrol sama bot. */
const GROUP_CONTINUATION_MS = 2 * 60 * 1000

interface WahubIncomingMessage {
  from?: string
  senderNumber?: string
  senderName?: string
  /** JID chat asal pesan ini (beda dari "from" kalau pesannya dari GRUP — "from" sudah
   *  di-resolve ke JID pengirimnya, bukan chat/grupnya). Grup selalu berakhiran "@g.us". */
  chatId?: string
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

/** Grup itu tempat diskusi macam-macam, bukan cuma buat nanya bot — jadi cuma pesan yang
 *  diawali "Naya" (case-insensitive, bebas dikasih koma/spasi/tanda baca sesudahnya) yang
 *  dianggap ditujukan ke bot. Selain itu diabaikan total. Contoh valid: "Naya, cek piutang dong",
 *  "naya cek piutang". Return null kalau tidak match (atau tidak ada isi setelah "Naya"-nya). */
function stripNayaTrigger(text: string): string | null {
  const match = text.match(/^naya\b[\s,.:!-]*/i)
  if (!match) return null
  const rest = text.slice(match[0].length).trim()
  return rest || null
}

export async function handleWhatsappWebhook(payload: WahubWebhookPayload) {
  const message = payload.message
  if (!message?.from) return { skipped: "no message" }

  // WAHUB kirim webhook untuk pesan masuk MAUPUN keluar (termasuk balasan bot sendiri).
  // "to" cuma "me" kalau ini pesan yang benar-benar masuk dari orang lain.
  if (message.to !== "me") return { skipped: "outgoing message" }
  if (!message.body?.trim()) return { skipped: "empty body" }

  const command = message.body.trim()

  // Pesan dari WA Grup ops internal — dideteksi lewat "chatId" (JID grup, "...@g.us"), BUKAN
  // "from" (itu sudah di-resolve ke JID pengirimnya sendiri, bukan grupnya — lihat backend-wahub).
  // Balasannya WAJIB ke grup itu sendiri, bukan DM pribadi ke pengirimnya. Otorisasinya cukup
  // "ada di grup ini" (grup internal, tertutup) + manggil "Naya" — TIDAK perlu nomornya juga
  // terdaftar sebagai User.phoneNumber. Kalau pengirimnya kebetulan match User terdaftar, dipakai
  // buat identitas/nama di log; kalau tidak, tetap diproses pakai nomornya sebagai identitas.
  const groupJid = process.env.WAHUB_GROUP_JID
  if (groupJid && message.chatId === groupJid) {
    if (!message.senderNumber) return { skipped: "group message without senderNumber" }

    const staff = await findRegisteredStaff(message.senderNumber)
    const actorId = staff?.id ?? normalizePhoneNumber(message.senderNumber)
    const actorName = staff?.name ?? message.senderName ?? message.senderNumber

    const thread = await getThread("staff", actorId)
    const isFresh = thread && Date.now() - thread.updatedAt.getTime() < THREAD_IDLE_MS
    const isContinuation = thread && Date.now() - thread.updatedAt.getTime() < GROUP_CONTINUATION_MS

    // Grup itu ramai diskusi lain-lain — normalnya cuma pesan yang eksplisit manggil "Naya" yang
    // direspon, biar bot tidak ikut-ikutan nimbrung ke semua chat. Pengecualian: kalau orang yang
    // sama baru saja (<2 menit) dijawab Naya, pesan susulannya dianggap masih nyambung ke jawaban
    // itu tanpa perlu ulang panggil "Naya,".
    const groupCommand = isContinuation ? command : stripNayaTrigger(command)
    if (!groupCommand) return { skipped: "group message without Naya trigger" }

    const history = isFresh ? (thread!.history as unknown as Anthropic.MessageParam[]) : undefined

    const { reply, messages } = await runAgent({ mode: "staff", actorId, actorName, command: groupCommand, history })

    if (thread) {
      await prisma.whatsappThread.update({ where: { id: thread.id }, data: { history: messages as unknown as object } })
    } else {
      await prisma.whatsappThread.create({ data: { senderType: "staff", userId: actorId, history: messages as unknown as object } })
    }

    await sendWhatsappMessage(groupJid, reply)
    return { handled: true, actorType: "staff", name: actorName, channel: "group", registered: !!staff }
  }

  const digits = message.senderNumber || message.from.replace(/@.*$/, "")

  const staff = await findRegisteredStaff(digits)
  if (staff) {
    const thread = await getThread("staff", staff.id)
    const isFresh = thread && Date.now() - thread.updatedAt.getTime() < THREAD_IDLE_MS
    const history = isFresh ? (thread!.history as unknown as Anthropic.MessageParam[]) : undefined

    const { reply, messages } = await runAgent({ mode: "staff", actorId: staff.id, actorName: staff.name, command, history })

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
