/** Bagian lokal sessionId WAHUB untuk 1 koneksi WA milik Sales — WAHUB sendiri yang nambahin
 *  prefix "{clientId}-" (lihat wahub.ts, docs/04-database.md §11.1). Suffix acak karena 1 Sales
 *  bisa punya lebih dari 1 koneksi (nomor) sekaligus. */
export function newWahubSessionId(userId: string) {
  return `sales-${userId}-${crypto.randomUUID().slice(0, 8)}`
}

export function marketingWhatsappWebhookUrl(sessionId: string) {
  const appBaseUrl = process.env.APP_BASE_URL
  const secret = process.env.WAHUB_WEBHOOK_SECRET
  if (!appBaseUrl || !secret) throw new Error("APP_BASE_URL / WAHUB_WEBHOOK_SECRET belum di-set")
  return `${appBaseUrl}/api/marketing/whatsapp/webhook?secret=${secret}&session=${encodeURIComponent(sessionId)}`
}
