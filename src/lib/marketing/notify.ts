import { prisma } from "@/lib/prisma"

/**
 * Bikin 1 baris `LeadNotification` untuk 1 user. Idempotent via `dedupeKey` unik —
 * `createMany({ skipDuplicates })` jadi pemanggilan ulang dengan key sama tidak dobel.
 *
 * Pengiriman push nyata (Web Push) = `sendWebPush`, no-op sampai VAPID di-set (Fase 10).
 */
export async function createNotification(input: {
  userId: string
  type: string
  title: string
  body: string
  entityType?: string
  entityId?: string
  deepLink?: string
  dedupeKey: string
}): Promise<boolean> {
  const res = await prisma.leadNotification.createMany({
    data: [
      {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        deepLink: input.deepLink ?? null,
        dedupeKey: input.dedupeKey,
        status: "PENDING",
      },
    ],
    skipDuplicates: true,
  })
  if (res.count > 0) void sendWebPush(input.userId, input.title, input.body, input.deepLink)
  return res.count > 0
}

/** Kirim Web Push ke semua device user. No-op kalau VAPID belum di-set / lib belum ada.
 *  Diaktifkan di Fase 10 (npm i web-push + VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY). */
export async function sendWebPush(_userId: string, _title: string, _body: string, _url?: string): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return
  // TODO Fase 10: load web-push, ambil PushSubscription aktif user, kirim payload JSON.
}
