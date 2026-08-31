import { EventEmitter } from "node:events"
import { Client, Pool } from "pg"

/**
 * Bus event realtime modul Marketing — jembatan antara titik-titik yang membuat data baru
 * (webhook WA masuk, kirim balasan, notifikasi) dan koneksi SSE (`/api/marketing/stream`) yang
 * sedang ditahan browser.
 *
 * Dulu ini murni `EventEmitter` in-process — cuma nyampe kalau publisher & SSE listener kebetulan
 * hidup di proses Node yang SAMA. Kalau app di-deploy multi-proses/multi-instance, event dari
 * proses lain gak akan pernah nyampe ke koneksi SSE di proses ini (Inbox kelihatan "diem",
 * update baru kebawa pas ada trigger lain kayak polling fallback). Sekarang publish lewat
 * Postgres `pg_notify` + tiap proses `LISTEN` sendiri-sendiri, jadi event nyampe ke SEMUA proses
 * app tanpa peduli topologi deploy-nya. Konsumen (SSE route + client) tidak berubah.
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
  // status delivery pesan keluar berubah (ack WAHUB): SENT / DELIVERED / READ / FAILED
  | { type: "status"; conversationId: string; providerMessageId: string; status: string; at: string }
  // customer sedang mengetik di WhatsApp (presence "composing" dari WAHUB)
  | { type: "typing"; conversationId: string; at: string }

const PG_CHANNEL = "marketing_events"
const BUS_CHANNEL = "evt"

// Simpan di globalThis biar selamat dari hot-reload dev (module re-eval) — pola sama dengan
// singleton PrismaClient.
const g = globalThis as unknown as {
  __mktBus?: EventEmitter
  __mktNotifyPool?: Pool
  __mktListenStarted?: boolean
}

const bus = g.__mktBus ?? (g.__mktBus = new EventEmitter())
// Tiap koneksi SSE nambah 1 listener — matikan warning "possible memory leak".
bus.setMaxListeners(0)

function getNotifyPool(): Pool {
  if (!g.__mktNotifyPool) {
    g.__mktNotifyPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 })
  }
  return g.__mktNotifyPool
}

/** Sambungan `LISTEN` persisten ke Postgres, 1 per proses — dibuat lazy (baru dipanggil pas ada
 *  SSE client pertama connect) supaya gak connect ke DB pas build/module-load. Auto-reconnect
 *  kalau putus (jaringan flap, DB restart, dsb). */
function ensureListening() {
  if (g.__mktListenStarted) return
  g.__mktListenStarted = true

  const connect = () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

    client.on("notification", (msg) => {
      if (msg.channel !== PG_CHANNEL || !msg.payload) return
      try {
        bus.emit(BUS_CHANNEL, JSON.parse(msg.payload) as MarketingEvent)
      } catch {
        /* payload rusak — abaikan */
      }
    })
    client.on("error", () => {
      client.end().catch(() => {})
      setTimeout(connect, 2000)
    })
    client.on("end", () => setTimeout(connect, 2000))

    client
      .connect()
      .then(() => client.query(`LISTEN ${PG_CHANNEL}`))
      .catch(() => {
        client.end().catch(() => {})
        setTimeout(connect, 2000)
      })
  }
  connect()
}

export function publishMarketingEvent(evt: MarketingEvent): void {
  getNotifyPool()
    .query("SELECT pg_notify($1, $2)", [PG_CHANNEL, JSON.stringify(evt)])
    .catch((err) => console.error("[marketing realtime] gagal publish event:", err))
}

export function subscribeMarketingEvents(listener: (evt: MarketingEvent) => void): () => void {
  ensureListening()
  bus.on(BUS_CHANNEL, listener)
  return () => {
    bus.off(BUS_CHANNEL, listener)
  }
}
