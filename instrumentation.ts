export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const globalForCron = globalThis as unknown as { cronRegistered?: boolean }
  if (globalForCron.cronRegistered) return
  globalForCron.cronRegistered = true

  const cron = await import("node-cron")
  const { runDashboardReport } = await import("@/lib/cron/dashboard-report")
  const { runWeeklyReport } = await import("@/lib/cron/weekly-report")
  const { runRecurringBillReminders } = await import("@/lib/cron/recurring-bill-reminders")
  const { runReceivableFollowups } = await import("@/lib/cron/receivable-followups")
  const { runProjectTerminInvoicing } = await import("@/lib/cron/project-termin-invoicing")
  const { registerWahubWebhook } = await import("@/lib/wahub")

  // Daftarkan ulang webhook WAHUB (sesi WA khusus simple-system) tiap kali server start.
  registerWahubWebhook().catch((e) => console.error("[wahub] registrasi webhook saat startup gagal:", e))

  // Laporan pagi jam 07:00 WIB ke grup WA internal (gambar + caption + link Dashboard).
  cron.schedule(
    "0 7 * * *",
    () => {
      runDashboardReport("Pagi").catch((e) => console.error("[cron] dashboard-report (pagi) gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Laporan sore jam 16:00 WIB ke grup WA internal.
  cron.schedule(
    "0 16 * * *",
    () => {
      runDashboardReport("Sore").catch((e) => console.error("[cron] dashboard-report (sore) gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Rekap mingguan tiap Senin jam 07:30 WIB.
  cron.schedule(
    "30 7 * * 1",
    () => {
      runWeeklyReport().catch((e) => console.error("[cron] weekly-report gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Cek biaya berkala jatuh tempo & tanya konfirmasi ke staf, jam 08:00 WIB.
  cron.schedule(
    "0 8 * * *",
    () => {
      runRecurringBillReminders().catch((e) => console.error("[cron] recurring-bill-reminders gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Follow-up tagihan overdue ke Client (kalau toggle AI follow-up ON), jam 09:00 WIB.
  cron.schedule(
    "0 9 * * *",
    () => {
      runReceivableFollowups().catch((e) => console.error("[cron] receivable-followups gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Auto-generate invoice termin Project yang jatuh tempo H-3, jam 06:00 WIB (sebelum laporan pagi).
  cron.schedule(
    "0 6 * * *",
    () => {
      runProjectTerminInvoicing().catch((e) => console.error("[cron] project-termin-invoicing gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  console.log(
    "[cron] Terdaftar: auto-invoice termin project (06:00), laporan pagi (07:00), laporan sore (16:00), rekap mingguan (Senin 07:30), cek biaya berkala (08:00), follow-up piutang (09:00) WIB"
  )
}
