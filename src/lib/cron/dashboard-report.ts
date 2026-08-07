import { sendWhatsappImage } from "@/lib/wahub"
import { getDashboardSnapshot } from "@/lib/dashboard-report-images"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Laporan ringkasan Dashboard ke grup WA internal — dipanggil pagi (07:00 WIB) dan sore (16:00
 *  WIB), lihat instrumentation.ts. Dikirim sebagai 2 gambar berurutan lewat mediaUrl yang WAHUB
 *  fetch sendiri langsung dari route on-demand (/api/reports/dashboard-image[-2]), BUKAN file
 *  statis di public/reports — sempat dicoba render-lalu-tulis-ke-disk supaya WAHUB nggak nunggu
 *  render 15-20 detik, tapi di production (Coolify) itu malah gagal total ("Failed to fetch
 *  stream") karena container yang nulis file beda dari yang melayani GET-nya (disk lokal nggak
 *  persisten/dibagi antar instance). Route on-demand ini sudah dicek jalan (200, PNG valid,
 *  ~18 detik) — lebih lambat tapi jauh lebih reliable daripada bergantung ke disk lokal. */
export async function runDashboardReport(waktu: "Pagi" | "Sore" | "Manual") {
  const groupJid = process.env.WAHUB_GROUP_JID
  if (!groupJid) {
    console.warn("[cron] dashboard-report dilewati: WAHUB_GROUP_JID belum di-set")
    throw new Error("WAHUB_GROUP_JID belum di-set")
  }

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000"
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

  await sendWhatsappImage(groupJid, `${appBaseUrl}/api/reports/dashboard-image`, caption)
  await sendWhatsappImage(groupJid, `${appBaseUrl}/api/reports/dashboard-image-2`, "🌐🖥️ Detail Domain & Biaya Berkala")
}
