import webpush from "web-push"

import { prisma } from "@/lib/prisma"

let vapidReady = false
function ensureVapid(): boolean {
  if (vapidReady) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@onyseven.com", pub, priv)
  vapidReady = true
  return true
}

/**
 * Bikin 1 baris `LeadNotification` untuk 1 user. Idempotent via `dedupeKey` unik —
 * `createMany({ skipDuplicates })` jadi pemanggilan ulang dengan key sama tidak dobel.
 * Kalau baris baru benar-benar dibuat → kirim Web Push ke device aktif user (best-effort).
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
  if (res.count > 0) {
    void sendWebPush(input.userId, input.title, input.body, input.deepLink).catch(() => {})
    await prisma.leadNotification.updateMany({
      where: { dedupeKey: input.dedupeKey, sentAt: null },
      data: { sentAt: new Date(), status: "SENT" },
    })
  }
  return res.count > 0
}

/** Kirim Web Push ke semua device aktif user. No-op kalau VAPID belum di-set.
 *  Subscription yang ditolak (404/410) otomatis dinonaktifkan. */
export async function sendWebPush(userId: string, title: string, body: string, url?: string): Promise<void> {
  if (!ensureVapid()) return
  const subs = await prisma.pushSubscription.findMany({
    where: { userId, isActive: true, endpoint: { not: "" } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })
  if (subs.length === 0) return

  const payload = JSON.stringify({ title, body, url: url || "/marketing", tag: url })
  await Promise.all(
    subs.map(async (s) => {
      if (!s.p256dh || !s.auth) return
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.update({ where: { id: s.id }, data: { isActive: false } }).catch(() => {})
        }
      }
    }),
  )
}
