import { randomUUID } from "crypto"
import { mkdir, writeFile, unlink } from "fs/promises"
import path from "path"
import { sendWhatsappImage } from "@/lib/wahub"
import { getDashboardSnapshot, renderDashboardImage1, renderDashboardImage2 } from "@/lib/dashboard-report-images"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

const REPORTS_DIR = path.join(process.cwd(), "public", "reports")

/** Render gambar laporan sampai selesai lalu simpan sebagai file statis di public/reports —
 *  WAHUB fetch mediaUrl-nya sendiri secara sinkron sebelum bisa kirim pesan WA, jadi kalau
 *  URL yang dikasih ke WAHUB masih route on-demand (render next/og bisa 15-20 detik), socket
 *  WA-nya keburu bermasalah/timeout sebelum gambar selesai. Dengan render dulu ke file statis,
 *  saat WAHUB fetch URL-nya itu sudah instan (tinggal serve file), bukan nunggu render. */
async function renderToStaticFile(imageResponse: Response, appBaseUrl: string) {
  await mkdir(REPORTS_DIR, { recursive: true })
  const filename = `${randomUUID()}.png`
  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  await writeFile(path.join(REPORTS_DIR, filename), buffer)
  return { url: `${appBaseUrl}/reports/${filename}`, filename }
}

async function cleanup(filenames: string[]) {
  await Promise.all(
    filenames.map((f) =>
      unlink(path.join(REPORTS_DIR, f)).catch((e) => console.warn(`[cron] Gagal hapus file laporan sementara ${f}:`, e.message))
    )
  )
}

/** Laporan ringkasan Dashboard ke grup WA internal — dipanggil pagi (07:00 WIB) dan sore (16:00
 *  WIB), lihat instrumentation.ts. Dikirim sebagai 2 gambar berurutan:
 *  1. Resume + Piutang Terbesar + Server Belum Dibayar
 *  2. Domain Perlu Perhatian + Biaya Berkala Jatuh Tempo */
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
    "",
    `🔗 ${appBaseUrl}/dashboard?quick=1`,
  ].join("\n")

  const [file1, file2] = await Promise.all([
    renderToStaticFile(renderDashboardImage1(snapshot, now), appBaseUrl),
    renderToStaticFile(renderDashboardImage2(snapshot, now), appBaseUrl),
  ])

  try {
    await sendWhatsappImage(groupJid, file1.url, caption)
    await sendWhatsappImage(groupJid, file2.url, "🌐🖥️ Detail Domain & Biaya Berkala")
  } finally {
    await cleanup([file1.filename, file2.filename])
  }
}
