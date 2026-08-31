const WAHUB_BASE_URL = process.env.WAHUB_BASE_URL
const WAHUB_API_KEY = process.env.WAHUB_API_KEY

// Instance WAHUB TERPISAH khusus modul Marketing (backend-wahub-dewari, beda dari instance
// WAHUB_BASE_URL/WAHUB_API_KEY di atas yang dipakai Director Assistant) — sengaja dedicated,
// bukan numpang, supaya traffic per-Sales sama sekali tidak bersinggungan sama sesi AI Agent.
const MARKETING_WAHUB_BASE_URL = process.env.MARKETING_WAHUB_BASE_URL
const MARKETING_WAHUB_API_KEY = process.env.MARKETING_WAHUB_API_KEY

/** Ubah nomor lokal (08...) jadi format internasional (62...) yang dipakai WAHUB. */
export function normalizePhoneNumber(raw: string) {
  const digits = raw.replace(/[^0-9]/g, "")
  if (digits.startsWith("62")) return digits
  if (digits.startsWith("0")) return `62${digits.slice(1)}`
  return digits
}

export async function sendWhatsappMessage(rawNumber: string, message: string) {
  if (!WAHUB_BASE_URL || !WAHUB_API_KEY) {
    throw new Error("WAHUB_BASE_URL / WAHUB_API_KEY belum di-set")
  }

  // JID grup (mis. "xxxxx@g.us") dikirim apa adanya — normalisasi cuma relevan untuk nomor
  // individu format lokal/internasional.
  const number = rawNumber.includes("@") ? rawNumber : normalizePhoneNumber(rawNumber)

  const res = await fetch(`${WAHUB_BASE_URL}/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": WAHUB_API_KEY },
    body: JSON.stringify({ number, message }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal kirim (${res.status}): ${text.slice(0, 200)}`)
  }

  return res.json() as Promise<{ success: boolean }>
}

/** Kirim gambar/dokumen lewat URL (WAHUB yang fetch mediaUrl-nya sendiri) + caption opsional. */
export async function sendWhatsappImage(rawNumber: string, mediaUrl: string, caption?: string) {
  if (!WAHUB_BASE_URL || !WAHUB_API_KEY) {
    throw new Error("WAHUB_BASE_URL / WAHUB_API_KEY belum di-set")
  }

  const number = rawNumber.includes("@") ? rawNumber : normalizePhoneNumber(rawNumber)

  const res = await fetch(`${WAHUB_BASE_URL}/api/messages/send-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": WAHUB_API_KEY },
    body: JSON.stringify({ number, mediaUrl, caption }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal kirim media (${res.status}): ${text.slice(0, 200)}`)
  }

  return res.json() as Promise<{ success: boolean }>
}

// ---------------------------------------------------------------------------
// Session per-Sales (modul Marketing) — pakai MARKETING_WAHUB_BASE_URL/MARKETING_WAHUB_API_KEY
// (instance WAHUB terpisah, backend-wahub-dewari), BUKAN WAHUB_BASE_URL/WAHUB_API_KEY di atas
// (itu tetap punya Director Assistant). Dalam SATU instance Marketing ini sendiri, 1 client key
// bisa punya banyak session sekaligus, dibedakan `sessionId` lokal unik per Sales (mis.
// "sales-{userId}") — WAHUB auto-prefix jadi "{clientId}-{sessionId}", tiap session punya
// webhookUrl SENDIRI. Lihat docs/01-project-overview.md §10.3 & docs/04-database.md §11.1.
// ---------------------------------------------------------------------------

function requireMarketingWahubEnv() {
  if (!MARKETING_WAHUB_BASE_URL || !MARKETING_WAHUB_API_KEY) {
    throw new Error("MARKETING_WAHUB_BASE_URL / MARKETING_WAHUB_API_KEY belum di-set")
  }
}

/** Mulai (atau no-op kalau sudah jalan) session WAHUB baru untuk 1 Sales. */
export async function startWahubSession(sessionId: string, webhookUrl: string) {
  requireMarketingWahubEnv()
  const res = await fetch(`${MARKETING_WAHUB_BASE_URL}/api/sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": MARKETING_WAHUB_API_KEY! },
    body: JSON.stringify({ sessionId, webhookUrl }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal mulai session (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<{ message: string }>
}

/** Status koneksi session: "starting" | "qr_ready" | "ready" | "failed" (dari WAHUB). */
export async function getWahubSessionStatus(sessionId: string) {
  requireMarketingWahubEnv()
  const res = await fetch(`${MARKETING_WAHUB_BASE_URL}/api/sessions/status/${encodeURIComponent(sessionId)}`, {
    headers: { "x-api-key": MARKETING_WAHUB_API_KEY! },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal cek status (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<{ sessionId: string; status: string; phoneNumber?: string | null }>
}

/** QR code buat scan — WAHUB balikin HTML `<img src="data:...">`, di sini di-parse jadi data URL
 *  polos supaya gampang dipakai langsung di <img src=...> React. Null kalau QR belum tersedia
 *  (mis. status belum "qr_ready"). */
export async function getWahubSessionQrDataUrl(sessionId: string) {
  requireMarketingWahubEnv()
  const res = await fetch(`${MARKETING_WAHUB_BASE_URL}/api/sessions/qr/${encodeURIComponent(sessionId)}`, {
    headers: { "x-api-key": MARKETING_WAHUB_API_KEY! },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal ambil QR (${res.status}): ${text.slice(0, 200)}`)
  }
  const html = await res.text()
  const match = html.match(/src="([^"]+)"/)
  return match?.[1] ?? null
}

/** Logout — memutus koneksi WhatsApp session ini (Sales perlu scan ulang kalau mau connect lagi). */
export async function logoutWahubSession(sessionId: string) {
  requireMarketingWahubEnv()
  const res = await fetch(`${MARKETING_WAHUB_BASE_URL}/api/sessions/logout/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "x-api-key": MARKETING_WAHUB_API_KEY! },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal logout (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<{ success: boolean }>
}

/** Kirim pesan teks dari session Sales tertentu (bukan session "default" AI Agent). */
export async function sendWhatsappMessageFromSession(sessionId: string, rawNumber: string, message: string) {
  requireMarketingWahubEnv()
  const number = rawNumber.includes("@") ? rawNumber : normalizePhoneNumber(rawNumber)
  const res = await fetch(`${MARKETING_WAHUB_BASE_URL}/api/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": MARKETING_WAHUB_API_KEY! },
    body: JSON.stringify({ sessionId, number, message }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal kirim (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<WahubSendResult>
}

/** Riwayat chat 1 nomor dari WhatsApp session Sales itu sendiri (on-demand history sync
 *  Baileys, lihat fetchChatHistory di backend-wahub) — HANYA chat yang memang pernah terjadi
 *  di HP Sales, array kosong = memang tidak ada riwayat (bukan error). Bisa makan sampai
 *  ~20 detik (WAHUB nunggu balasan WhatsApp), jadi jangan dipanggil dari jalur yang harus cepat. */
export async function fetchChatHistoryFromSession(sessionId: string, rawNumber: string, count = 50) {
  requireMarketingWahubEnv()
  const number = normalizePhoneNumber(rawNumber)
  const res = await fetch(
    `${MARKETING_WAHUB_BASE_URL}/api/messages/history/${encodeURIComponent(sessionId)}?number=${encodeURIComponent(number)}&count=${count}`,
    { headers: { "x-api-key": MARKETING_WAHUB_API_KEY! } },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal ambil riwayat chat (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<{ messages: { id: string; fromMe: boolean; body: string; timestamp: number }[] }>
}

/** Bentuk respons WAHUB saat kirim pesan — id pesan dipakai buat mencocokkan ack status
 *  (SENT/DELIVERED/READ) yang datang lewat webhook. Nama field beda-beda antar versi wrapper,
 *  jadi semua kemungkinan ditangkap. */
type WahubKeyish = { key?: { id?: string }; id?: string; messageId?: string }
export type WahubSendResult = WahubKeyish & {
  success?: boolean
  // backend-wahub membungkus hasil Baileys `sock.sendMessage()` (WAMessage) di `response`.
  response?: WahubKeyish
  data?: WahubKeyish
}

/** Ambil id pesan dari respons WAHUB (atau null kalau wrapper-nya tidak mengembalikannya). */
export function extractWahubMessageId(r: WahubSendResult | null | undefined): string | null {
  const pick = (x: WahubKeyish | null | undefined) => x?.key?.id || x?.messageId || x?.id || null
  return pick(r) || pick(r?.response) || pick(r?.data) || null
}

/** Kirim media (gambar/dokumen via URL, WAHUB yang fetch) + caption dari session Sales tertentu. */
export async function sendWhatsappMediaFromSession(sessionId: string, rawNumber: string, mediaUrl: string, caption?: string) {
  requireMarketingWahubEnv()
  const number = rawNumber.includes("@") ? rawNumber : normalizePhoneNumber(rawNumber)
  const res = await fetch(`${MARKETING_WAHUB_BASE_URL}/api/messages/send-media`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": MARKETING_WAHUB_API_KEY! },
    body: JSON.stringify({ sessionId, number, mediaUrl, caption }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WAHUB gagal kirim media (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<WahubSendResult>
}

/** Daftarkan ulang webhook sesi WAHUB milik simple-system — dipanggil tiap kali server start
 *  (lihat instrumentation.ts).
 *  PENTING: sesi WAHUB cuma bisa punya SATU webhookUrl aktif. Sejak simple-system ikut memakai
 *  API key sesi WA milik Director Assistant (supaya bisa kirim/terima pesan dari WA Grup yang
 *  sama), Director Assistant-lah yang wajib jadi pemilik webhook — kalau simple-system ikut
 *  registerWahubWebhook() pakai key yang sama, itu akan MENIMPA webhook Director Assistant dan
 *  mematikan fitur chat-nya. Makanya fungsi ini sengaja no-op kecuali WAHUB_MANAGE_WEBHOOK="true"
 *  di-set eksplisit (dipakai kalau suatu saat simple-system balik pakai sesi WA sendiri lagi). */
export async function registerWahubWebhook() {
  if (process.env.WAHUB_MANAGE_WEBHOOK !== "true") {
    console.log(
      "[wahub] Lewati registrasi webhook — simple-system numpang sesi WA Director Assistant, jadi Director Assistant yang pegang webhook-nya."
    )
    return
  }

  const appBaseUrl = process.env.APP_BASE_URL
  const webhookSecret = process.env.WAHUB_WEBHOOK_SECRET

  if (!WAHUB_BASE_URL || !WAHUB_API_KEY || !appBaseUrl || !webhookSecret) {
    console.warn(
      "[wahub] Lewati registrasi webhook otomatis — pastikan WAHUB_BASE_URL, WAHUB_API_KEY, APP_BASE_URL, dan WAHUB_WEBHOOK_SECRET semua sudah di-set."
    )
    return
  }

  const webhookUrl = `${appBaseUrl}/api/whatsapp/webhook?secret=${webhookSecret}`

  try {
    const res = await fetch(`${WAHUB_BASE_URL}/api/sessions/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": WAHUB_API_KEY },
      body: JSON.stringify({ webhookUrl }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      console.error(`[wahub] Gagal daftar ulang webhook (${res.status}):`, JSON.stringify(data))
      return
    }
    console.log("[wahub] Webhook otomatis ter-registrasi:", data?.message ?? "sukses")
  } catch (error) {
    console.error("[wahub] Gagal menghubungi WAHUB untuk registrasi webhook:", error)
  }
}
