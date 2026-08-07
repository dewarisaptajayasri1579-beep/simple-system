const WAHUB_BASE_URL = process.env.WAHUB_BASE_URL
const WAHUB_API_KEY = process.env.WAHUB_API_KEY

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
