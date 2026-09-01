import webpush from "web-push"

import { prisma } from "@/lib/prisma"
import { publishMarketingEvent } from "@/lib/marketing/realtime"

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
    publishMarketingEvent({ type: "notification", userId: input.userId, at: new Date().toISOString() })
    // Tag = entity yang dituju notifikasi ini (bukan deepLink) — dipakai dua arah: OS dedupe notif
    // baru yang menunjuk entity sama, DAN sebagai kunci buat nutup notif ini nanti kalau sudah
    // dibaca lewat jalur lain (lihat closeWebPushNotification).
    const tag = input.entityType && input.entityId ? `${input.entityType}:${input.entityId}` : undefined
    void sendWebPush(input.userId, input.title, input.body, input.deepLink, tag).catch(() => {})
    await prisma.leadNotification.updateMany({
      where: { dedupeKey: input.dedupeKey, sentAt: null },
      data: { sentAt: new Date(), status: "SENT" },
    })
  }
  return res.count > 0
}

/** Kirim Web Push ke semua device aktif user. No-op kalau VAPID belum di-set.
 *  Subscription yang ditolak (404/410) otomatis dinonaktifkan. */
export async function sendWebPush(userId: string, title: string, body: string, url?: string, tag?: string): Promise<void> {
  if (!ensureVapid()) return
  const subs = await prisma.pushSubscription.findMany({
    where: { userId, isActive: true, endpoint: { not: "" } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })
  if (subs.length === 0) return

  const payload = JSON.stringify({ title, body, url: url || "/marketing", tag })
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

/** Push "senyap" khusus buat nutup notifikasi yang sudah tag-nya di tray device (Android/desktop) —
 *  dikirim saat pesan/entity terkait sudah dibaca lewat jalur lain (mis. buka Inbox duluan sebelum
 *  tap notifikasi-nya). Service worker (`public/sw.js`) mengenali `data.closeTag` dan menutup semua
 *  notifikasi bertag sama, TANPA menampilkan notifikasi baru. */
export async function closeWebPushNotification(userId: string, tag: string): Promise<void> {
  if (!ensureVapid()) return
  const subs = await prisma.pushSubscription.findMany({
    where: { userId, isActive: true, endpoint: { not: "" } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })
  if (subs.length === 0) return

  const payload = JSON.stringify({ closeTag: tag })
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
