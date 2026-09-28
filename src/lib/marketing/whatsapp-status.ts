import { prisma } from "@/lib/prisma"
import { getWahubSessionStatus } from "@/lib/wahub"

/** Umur maksimal status koneksi di DB sebelum dianggap basi dan dicek ulang ke WAHUB. */
const DEFAULT_MAX_AGE_MS = 60_000

export interface SyncableConnection {
  id: string
  wahubSessionId: string
  status: string
  phoneNumber: string | null
  lastStatusCheckAt: Date | null
  lastConnectedAt: Date | null
}

/**
 * Samakan status 1 koneksi WA di DB dengan status asli session WAHUB.
 *
 * Kenapa perlu: sesi WAHUB bisa mati sendiri (HP mati/logout dari HP) TANPA webhook apa pun, jadi
 * `status` di DB bisa nyangkut "READY" selamanya. Dulu satu-satunya yang menyegarkan status adalah
 * GET /api/marketing/whatsapp/connections — dan itu cuma memeriksa koneksi milik user yang sedang
 * login. Akibatnya kalau lead punya dua chat (mis. satu ke nomor Ayu, satu ke nomor Candra) dan
 * sesi salah satunya sudah mati, detail percakapan tetap bilang "terhubung", composer tetap aktif,
 * lalu pengiriman baru gagal di WAHUB dengan "Session is not ready or does not exist".
 *
 * Dipanggil dari jalur baca detail percakapan, jadi di-throttle lewat `lastStatusCheckAt`
 * (default 60 detik) supaya tidak menambah 1 request WAHUB tiap kali polling Inbox jalan.
 * WAHUB tidak bisa dihubungi → status DB dibiarkan apa adanya (jangan sampai gangguan jaringan
 * sesaat bikin semua nomor kelihatan terputus).
 */
export async function syncConnectionStatus(
  connection: SyncableConnection,
  { maxAgeMs = DEFAULT_MAX_AGE_MS }: { maxAgeMs?: number } = {},
): Promise<string> {
  if (
    maxAgeMs > 0 &&
    connection.lastStatusCheckAt &&
    Date.now() - connection.lastStatusCheckAt.getTime() < maxAgeMs
  ) {
    return connection.status
  }

  try {
    const remote = await getWahubSessionStatus(connection.wahubSessionId)
    const status = remote?.status ? remote.status.toUpperCase() : "DISCONNECTED"
    await prisma.whatsappConnection.update({
      where: { id: connection.id },
      data: {
        status,
        phoneNumber: status === "READY" ? (remote?.phoneNumber ?? connection.phoneNumber) : connection.phoneNumber,
        lastStatusCheckAt: new Date(),
        lastConnectedAt: status === "READY" ? new Date() : connection.lastConnectedAt,
      },
    })
    return status
  } catch {
    return connection.status
  }
}

/** Ciri error WAHUB "session mati/tidak ada" — dipakai buat menandai koneksi DISCONNECTED di DB
 *  begitu pengiriman gagal karenanya, biar UI langsung jujur tanpa nunggu pemilik nomor buka
 *  halaman WhatsApp. Teks aslinya: `{"success":false,"error":"Session is not ready or does not exist"}`. */
export function isWahubSessionDeadError(message: string) {
  return /session is not ready|session not found|does not exist/i.test(message)
}
