import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

/**
 * SATU-SATUNYA definisi "belum dibalas" di modul Marketing: ada pesan customer yang lebih baru
 * dari balasan Sales terakhir (atau Sales belum pernah membalas sama sekali), dan leadnya masih
 * OPEN. Persis rumus yang dipakai eskalasi ke SPV, alert grup WA, dan syarat Ambil Alih
 * (escalation.ts, cron/marketing-unreplied-wa-group.ts, leads/[id]/assignments/route.ts).
 *
 * Dulu filter "Belum Dibalas" di Inbox & KPI "Chat Belum Dibalas" di Beranda pakai ukuran yang
 * BEDA: `Conversation.unreadCustomerCount > 0`. Counter itu cuma turun kalau PIC-nya sendiri
 * membuka percakapannya — membalas chat tidak menurunkannya, dan SPV/Manager yang membaca juga
 * tidak. Akibatnya badge nyangkut selamanya untuk chat yang sebenarnya sudah dibalas (saat
 * diperiksa: 240 dari 316 percakapan tampak "belum dibalas" padahal cuma 80 lead yang benar-benar
 * nggantung). Sekarang "belum dibalas" = kondisi di bawah ini di mana pun ditampilkan, dan
 * `unreadCustomerCount` dikembalikan ke arti aslinya: BELUM DIBACA.
 */
export const UNREPLIED_LEAD_WHERE: Prisma.LeadWhereInput = {
  outcome: "OPEN",
  lastCustomerMessageAt: { not: null },
  OR: [
    { lastSalesMessageAt: null },
    { lastSalesMessageAt: { lt: prisma.lead.fields.lastCustomerMessageAt } },
  ],
}

/** Bentuk data pesan yang dikirim ke client — dipakai bareng oleh list & detail conversation. */
export function messageDto(m: {
  id: string
  providerMessageId: string | null
  direction: string
  messageType: string
  body: string | null
  mediaUrl: string | null
  senderUserId: string | null
  sentAt: Date
  deliveryStatus: string
}) {
  return {
    id: m.id,
    providerMessageId: m.providerMessageId,
    direction: m.direction,
    messageType: m.messageType,
    body: m.body,
    mediaUrl: m.mediaUrl,
    senderUserId: m.senderUserId,
    sentAt: m.sentAt.toISOString(),
    deliveryStatus: m.deliveryStatus,
  }
}

export const MESSAGE_SELECT = {
  id: true,
  providerMessageId: true,
  direction: true,
  messageType: true,
  body: true,
  mediaUrl: true,
  senderUserId: true,
  sentAt: true,
  deliveryStatus: true,
} as const

export type MessageDto = ReturnType<typeof messageDto>
