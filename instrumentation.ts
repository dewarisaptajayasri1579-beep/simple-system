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
  const { runMarketingFollowupReminders } = await import("@/lib/cron/marketing-followup-reminders")
  const { runMarketingEscalations } = await import("@/lib/marketing/escalation")
  const { runMarketingAiReanalysis } = await import("@/lib/cron/marketing-ai-reanalysis")
  const { runMarketingUnrepliedWaGroupAlert } = await import("@/lib/cron/marketing-unreplied-wa-group")
  const { runProjectTerminInvoicing } = await import("@/lib/cron/project-termin-invoicing")
  const { runDatabaseBackup } = await import("@/lib/backup/database-backup")
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

  // Reminder follow up lead + escalation ke SPV/Manager (modul Marketing) — tiap jam :05.
  cron.schedule(
    "5 * * * *",
    () => {
      runMarketingFollowupReminders()
        .then((r) => r && r.created > 0 && console.log(`[cron] marketing-followup-reminders: ${r.created} notif baru`))
        .catch((e) => console.error("[cron] marketing-followup-reminders gagal:", e))
      runMarketingEscalations()
        .then((r) => r && r.created > 0 && console.log(`[cron] marketing-escalations: ${r.created} notif baru`))
        .catch((e) => console.error("[cron] marketing-escalations gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Alert grup WA Marketing untuk lead yang pesan customernya belum dibalas > ambang (Settings) —
  // tiap 5 menit. No-op kalau setting 0 / env JID kosong / di luar jam kerja.
  cron.schedule(
    "*/5 * * * *",
    () => {
      runMarketingUnrepliedWaGroupAlert()
        .then((r) => r && "alerted" in r && r.alerted && r.alerted > 0 && console.log(`[cron] marketing-unreplied-wa-group: ${r.alerted} lead di-alert ke grup`))
        .catch((e) => console.error("[cron] marketing-unreplied-wa-group gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // AI auto-reanalysis lead (modul Marketing) — tiap 10 menit, model Haiku.
  cron.schedule(
    "*/10 * * * *",
    () => {
      runMarketingAiReanalysis()
        .then((r) => r && "analyzed" in r && r.analyzed > 0 && console.log(`[cron] marketing-ai-reanalysis: ${r.analyzed} lead`))
        .catch((e) => console.error("[cron] marketing-ai-reanalysis gagal:", e))
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

  // Backup database (dump data schema simple_system) ke Google Drive, jam 20:00 WIB.
  cron.schedule(
    "0 20 * * *",
    () => {
      runDatabaseBackup()
        .then((r) => console.log(`[cron] database-backup selesai: ${r.fileName} (${r.tableCount} tabel, ${r.rowCount} baris)`))
        .catch((e) => console.error("[cron] database-backup gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  console.log(
    "[cron] Terdaftar: auto-invoice termin project (06:00), laporan pagi (07:00), laporan sore (16:00), rekap mingguan (Senin 07:30), cek biaya berkala (08:00), follow-up piutang (09:00), reminder follow up lead (tiap jam :05), backup database (20:00) WIB"
  )
}
