import { randomUUID } from "crypto"
import sharp from "sharp"
import { sendWhatsappImage } from "@/lib/wahub"
import { uploadToSupabaseStorage, deleteFromSupabaseStorage } from "@/lib/supabase-storage"
import { getDashboardSnapshot, renderDashboardImage1, renderDashboardImage2 } from "@/lib/dashboard-report-images"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Render, kompres ke JPEG (~30% lebih kecil dari PNG asli next/og, teks tetap tajam di quality
 *  90 — sudah dicek visual), lalu upload ke Supabase Storage (bucket public "Simple OS") supaya
 *  WAHUB fetch mediaUrl-nya cepat & reliable — bukan render on-demand (~20 detik, WAHUB keburu
 *  "Connection Closed" nunggu) dan bukan file statis di disk lokal container (beda instance/
 *  redeploy = hilang, gagal "Failed to fetch stream" di production). JPEG dipilih daripada WebP
 *  supaya WhatsApp pasti perlakukan sebagai foto biasa, bukan stiker. Lihat lib/supabase-storage.ts. */
async function renderAndUpload(imageResponse: Response) {
  const pngBuffer = Buffer.from(await imageResponse.arrayBuffer())
  const jpegBuffer = await sharp(pngBuffer).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  const filename = `dashboard-report-${randomUUID()}.jpg`
  const url = await uploadToSupabaseStorage(jpegBuffer, filename, "image/jpeg")
  return { url, filename }
}

const DELETE_DELAY_MS = 5 * 60 * 1000

/** Hapus baru 5 menit setelah dikirim (bukan langsung) — jaga-jaga kalau WAHUB masih retry/proses
 *  fetch media-nya di belakang layar setelah respons awal ke kita, supaya file-nya belum keburu
 *  hilang. Nggak di-await si pemanggil, jalan di background (proses server ini persisten, bukan
 *  serverless, jadi setTimeout tetap sempat jalan). */
function scheduleDelete(filenames: string[]) {
  setTimeout(() => {
    Promise.all(filenames.map((f) => deleteFromSupabaseStorage(f))).catch((e) =>
      console.warn("[cron] Gagal hapus file laporan setelah delay:", e)
    )
  }, DELETE_DELAY_MS)
}

/** Laporan ringkasan Dashboard ke grup WA internal — dipanggil pagi (07:00 WIB) dan sore (16:00
 *  WIB), lihat instrumentation.ts. Dikirim sebagai 2 gambar berurutan. */
export async function runDashboardReport(waktu: "Pagi" | "Sore" | "Manual") {
  const groupJid = process.env.WAHUB_GROUP_JID
  if (!groupJid) {
    console.warn("[cron] dashboard-report dilewati: WAHUB_GROUP_JID belum di-set")
    throw new Error("WAHUB_GROUP_JID belum di-set")
  }

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000"
  const now = new Date()
  const snapshot = await getDashboardSnapshot()

  const caption = [
    `📋 *Laporan ${waktu} SEVEN OS*`,
    "",
    `💰 Piutang: ${snapshot.piutang.count} invoice, ${formatRupiah(snapshot.piutang.total)}`,
    `🏦 Saldo Kas & Bank: ${formatRupiah(snapshot.totalSaldo)}`,
    `🌐 Domain perlu perhatian: ${snapshot.domain.expiredCount + snapshot.domain.expiringCount}`,
    `🖥️ Server perlu perhatian: ${snapshot.server.expiredCount + snapshot.server.expiringCount}`,
    `💸 Biaya berkala jatuh tempo: ${snapshot.biayaBerkala.dueCount}`,
    `⚠️ Tagihan lewat deadline SLA: ${snapshot.billingSla.overdueCount}`,
    "",
    `🔗 ${appBaseUrl}/dashboard?quick=1`,
  ].join("\n")

  const [file1, file2] = await Promise.all([
    renderAndUpload(renderDashboardImage1(snapshot, now)),
    renderAndUpload(renderDashboardImage2(snapshot, now)),
  ])

  try {
    await sendWhatsappImage(groupJid, file1.url, caption)
    await sendWhatsappImage(groupJid, file2.url, "🌐🖥️ Detail Domain & Biaya Berkala")
  } finally {
    scheduleDelete([file1.filename, file2.filename])
  }
}
