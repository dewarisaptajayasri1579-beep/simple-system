import { sendWhatsappImage } from "@/lib/wahub"
import { getDashboardSnapshot } from "@/lib/dashboard-snapshot"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Laporan ringkasan Dashboard (gambar + caption + link) ke grup WA internal — dipanggil pagi
 *  (07:00 WIB) dan sore (16:00 WIB), lihat instrumentation.ts. Gambarnya di-render on-the-fly
 *  lewat /api/reports/dashboard-image (next/og), WAHUB yang fetch URL-nya sendiri. */
export async function runDashboardReport(waktu: "Pagi" | "Sore") {
  const groupJid = process.env.WAHUB_GROUP_JID
  if (!groupJid) {
    console.warn("[cron] dashboard-report dilewati: WAHUB_GROUP_JID belum di-set")
    return
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
    `🔗 ${appBaseUrl}/dashboard`,
  ].join("\n")

  await sendWhatsappImage(groupJid, `${appBaseUrl}/api/reports/dashboard-image`, caption)
}
