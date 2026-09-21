import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/wahub"
import { syncAllStaleCostLinks } from "@/lib/cost-link-sync"
import { runDataConsistencyChecks } from "@/lib/data-consistency-check"

/** Cek Konsistensi Data — jalan otomatis tiap hari (jam 05:30 WIB, sebelum laporan pagi jam
 *  07:00 supaya angka yang dikirim jam 07:00 sudah bersih). Dua tahap:
 *
 *  1. Auto-benerin SEMUA temuan "Cost-link kemungkinan belum ke-sync" (lihat
 *     lib/cost-link-sync.ts) — satu-satunya jenis temuan yang punya perbaikan otomatis yang
 *     AMAN & deterministik (tanggalnya diambil langsung dari InvoicePayment yang sudah posted,
 *     bukan tebakan).
 *  2. Jalankan SEMUA pengecekan lagi (termasuk jenis yang tidak bisa dibenerin otomatis — jurnal
 *     tidak balance, overpayment, kurs janggal, dst) dan kirim WA ke Owner kalau masih ada sisa
 *     temuan yang perlu dicek manual. Tidak kirim WA kalau bersih (supaya tidak spam harian). */
export async function runDataConsistencySync() {
  const { synced, failed } = await syncAllStaleCostLinks()
  if (synced.length > 0) {
    console.log(`[cron] data-consistency-sync: ${synced.length} cost-link disinkronkan otomatis`, synced.map((s) => s.invoiceNumber))
  }
  if (failed.length > 0) {
    console.error(`[cron] data-consistency-sync: ${failed.length} cost-link gagal disinkronkan`, failed)
  }

  const remaining = await runDataConsistencyChecks()
  if (remaining.length === 0 && failed.length === 0) {
    console.log("[cron] data-consistency-sync: tidak ada temuan tersisa, tidak kirim WA")
    return
  }

  const owners = await prisma.user.findMany({
    where: { role: "owner", isActive: true, phoneNumber: { not: null } },
    select: { name: true, phoneNumber: true },
  })
  if (owners.length === 0) {
    console.warn("[cron] data-consistency-sync: ada temuan tersisa tapi tidak ada Owner dengan nomor HP untuk dikabari")
    return
  }

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000"
  const errorCount = remaining.filter((f) => f.severity === "error").length
  const warningCount = remaining.length - errorCount
  const MAX_LISTED = 10

  const message = [
    "🔍 *Cek Konsistensi Data — Harian*",
    "",
    synced.length > 0 ? `✅ ${synced.length} cost-link (Domain/Server/Maintenance) disinkronkan otomatis.` : null,
    failed.length > 0 ? `⚠️ ${failed.length} cost-link gagal disinkronkan otomatis — cek manual.` : null,
    remaining.length > 0 ? "" : null,
    remaining.length > 0 ? `Sisa ${remaining.length} temuan perlu dicek manual (${errorCount} error, ${warningCount} warning):` : null,
    ...remaining.slice(0, MAX_LISTED).map((f) => `• [${f.severity === "error" ? "ERROR" : "WARN"}] ${f.checkLabel} — ${f.entityLabel}`),
    remaining.length > MAX_LISTED ? `...dan ${remaining.length - MAX_LISTED} temuan lainnya.` : null,
    "",
    `🔗 Detail & tombol Sinkronkan: ${appBaseUrl}/pengaturan/cek-konsistensi-data`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n")

  for (const owner of owners) {
    try {
      await sendWhatsappMessage(owner.phoneNumber!, message)
    } catch (error) {
      console.error(`[cron] data-consistency-sync: gagal kirim WA ke ${owner.name}:`, error)
    }
  }
}
