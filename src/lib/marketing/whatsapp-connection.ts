/** Bagian lokal sessionId WAHUB untuk 1 Sales — WAHUB sendiri yang nambahin prefix
 *  "{clientId}-" (lihat wahub.ts, docs/04-database.md §11.1). */
export function wahubSessionIdForUser(userId: string) {
  return `sales-${userId}`
}

export function marketingWhatsappWebhookUrl(sessionId: string) {
  const appBaseUrl = process.env.APP_BASE_URL
  const secret = process.env.WAHUB_WEBHOOK_SECRET
  if (!appBaseUrl || !secret) throw new Error("APP_BASE_URL / WAHUB_WEBHOOK_SECRET belum di-set")
  return `${appBaseUrl}/api/marketing/whatsapp/webhook?secret=${secret}&session=${encodeURIComponent(sessionId)}`
}
