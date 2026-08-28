import { EventEmitter } from "node:events"

/**
 * Bus event realtime in-process modul Marketing — jembatan antara titik-titik yang membuat
 * data baru (webhook WA masuk, kirim balasan, notifikasi) dan koneksi SSE
 * (`/api/marketing/stream`) yang sedang ditahan browser.
 *
 * Tidak butuh infra tambahan SELAMA app jalan di SATU proses Node — asumsi yang sama dengan
 * `node-cron` di project ini. Kalau nanti di-scale multi-instance, cukup ganti sumber event
 * ke Postgres LISTEN/NOTIFY (`pg_notify` di publisher + satu `pg` client `LISTEN` di sini
 * yang re-emit ke bus); konsumen (SSE route + client) tidak berubah.
 */
export type MarketingEvent =
  | {
      type: "message"
      conversationId: string
      leadId: string
      direction: "INBOUND" | "OUTBOUND"
      at: string
    }
  | { type: "notification"; userId: string; at: string }

// Simpan di globalThis biar selamat dari hot-reload dev (module re-eval) — pola sama dengan
// singleton PrismaClient.
const g = globalThis as unknown as { __mktBus?: EventEmitter }
const bus = g.__mktBus ?? (g.__mktBus = new EventEmitter())
// Tiap koneksi SSE nambah 1 listener — matikan warning "possible memory leak".
bus.setMaxListeners(0)

const CHANNEL = "evt"

export function publishMarketingEvent(evt: MarketingEvent): void {
  bus.emit(CHANNEL, evt)
}

export function subscribeMarketingEvents(listener: (evt: MarketingEvent) => void): () => void {
  bus.on(CHANNEL, listener)
  return () => {
    bus.off(CHANNEL, listener)
  }
}
