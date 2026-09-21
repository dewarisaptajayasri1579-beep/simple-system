export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const globalForCron = globalThis as unknown as { cronRegistered?: boolean }
  if (globalForCron.cronRegistered) return
  globalForCron.cronRegistered = true

  const cron = await import("node-cron")
  const { runDashboardReport } = await import("@/lib/cron/dashboard-report")
  const { runWeeklyReport } = await import("@/lib/cron/weekly-report")
  const { runRecurringBillReminders } = await import("@/lib/cron/recurring-bill-reminders")
  const { runDataConsistencySync } = await import("@/lib/cron/data-consistency-sync")
  const { runReceivableFollowups } = await import("@/lib/cron/receivable-followups")
  const { runMarketingFollowupReminders } = await import("@/lib/cron/marketing-followup-reminders")
  const { runMarketingEscalations } = await import("@/lib/marketing/escalation")
  const { runMarketingAiReanalysis } = await import("@/lib/cron/marketing-ai-reanalysis")
  const { runMarketingUnrepliedWaGroupAlert } = await import("@/lib/cron/marketing-unreplied-wa-group")
  const { runProjectTerminInvoicing } = await import("@/lib/cron/project-termin-invoicing")
  const { runDatabaseBackup } = await import("@/lib/backup/database-backup")
  const { cleanupOldBackups } = await import("@/lib/backup/r2")
  const { r2BucketForVps } = await import("@/lib/monitoring/coolify")
  const { prisma } = await import("@/lib/prisma")
  const { runVpsMonitoringRefresh } = await import("@/lib/cron/vps-monitoring")
  const { registerWahubWebhook } = await import("@/lib/wahub")

  // Daftarkan ulang webhook WAHUB (sesi WA khusus simple-system) tiap kali server start.
  registerWahubWebhook().catch((e) => console.error("[wahub] registrasi webhook saat startup gagal:", e))

  // Cek Konsistensi Data jam 05:30 WIB — auto-sinkronkan cost-link Domain/Server/Maintenance
  // yang lupa ke-link saat Pembayaran (lihat lib/cost-link-sync.ts), lalu WA Owner kalau masih
  // ada temuan lain yang perlu dicek manual. Sengaja SEBELUM laporan pagi jam 07:00 supaya
  // angka yang dikirim di situ sudah bersih.
  cron.schedule(
    "30 5 * * *",
    () => {
      runDataConsistencySync().catch((e) => console.error("[cron] data-consistency-sync gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

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

  // Backup database (dump data schema simple_system) ke Cloudflare R2, jam 20:00 WIB.
  cron.schedule(
    "0 20 * * *",
    () => {
      runDatabaseBackup()
        .then((r) => console.log(`[cron] database-backup selesai: ${r.fileName} (${r.tableCount} tabel, ${r.rowCount} baris)`))
        .catch((e) => console.error("[cron] database-backup gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Retensi backup R2 (app ini + backup native Coolify di SEMUA bucket yang dipakai -- bucket
  // global default + bucket khusus tiap VPS yang di-pisah, lihat VpsServer.r2BucketName) --
  // tanggal 1 tiap bulan jam 02:00 WIB: per folder/database, bulan yang sudah lewat cuma
  // disisakan 1 file (yang terakhir), sisanya dihapus. Lihat lib/backup/r2.ts § cleanupOldBackups.
  cron.schedule(
    "0 2 1 * *",
    async () => {
      try {
        const vpsList = await prisma.vpsServer.findMany({ select: { r2BucketName: true } })
        const buckets = [...new Set([r2BucketForVps({ r2BucketName: null }), ...vpsList.map((v) => r2BucketForVps(v))])]
        let totalDeleted = 0
        for (const bucket of buckets) {
          const r = await cleanupOldBackups(bucket).catch((e) => {
            console.error(`[cron] backup-retention gagal buat bucket "${bucket}":`, e)
            return { deletedCount: 0 }
          })
          totalDeleted += r.deletedCount
        }
        console.log(`[cron] backup-retention selesai: ${totalDeleted} file lama dihapus di ${buckets.length} bucket`)
      } catch (e) {
        console.error("[cron] backup-retention gagal:", e)
      }
    },
    { timezone: "Asia/Jakarta" }
  )

  // Sync aplikasi dari Coolify API, auto-setup backup-ke-R2 utk database baru yang belum ada
  // jadwalnya, cek expiry domain (RDAP), cek terakhir diakses (log Traefik) untuk modul Monitoring
  // Server "VPS Lain" — tiap jam pas (:00), supaya info sync-nya tidak kadaluarsa lama. SENGAJA
  // TANPA refresh breakdown disk Docker (includeDockerDisk: false) — itu bagian yang berat/
  // I/O-intensive (~20-25 detik per VPS, beneran scan isi volume), dipisah ke cron sendiri jam
  // 03:00 (jam sepi) di bawah biar tidak numpuk tiap jam kena VPS produksi.
  cron.schedule(
    "0 * * * *",
    () => {
      runVpsMonitoringRefresh(undefined, { includeDockerDisk: false })
        .then((r) => console.log(`[cron] vps-monitoring (ringan) selesai: ${r.vpsCount} VPS, ${r.coolifySynced} app di-sync, ${r.backupsAutoCreated} backup baru di-setup, ${r.domainsChecked} domain expiry, ${r.accessChecked} last-access`))
        .catch((e) => console.error("[cron] vps-monitoring gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Refresh breakdown disk Docker (bagian berat dari vps-monitoring di atas) — jam 03:00 WIB,
  // jam sepi aktivitas, sekali sehari cukup karena datanya cuma dipakai buat breakdown "Disk
  // Docker" di halaman monitoring, bukan sesuatu yang butuh update tiap jam.
  cron.schedule(
    "0 3 * * *",
    () => {
      runVpsMonitoringRefresh(undefined, { includeDockerDisk: true })
        .then((r) => console.log(`[cron] vps-monitoring (disk Docker) selesai: ${r.dockerDiskRefreshed} VPS di-refresh`))
        .catch((e) => console.error("[cron] vps-monitoring (disk Docker) gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  // Rekap traffic per aplikasi (bandwidth + kunjungan unik) buat KPI "Sering/Normal/Jarang
  // digunakan" di monitoring — TIAP JAM (bukan sekali sehari jam 00:15 lagi), window pendek
  // ~2 jam yang di-MERGE ke baris hari itu. Diubah dari desain harian karena log Traefik VPS
  // ramai bisa ke-rotasi Docker dalam hitungan jam, kalah cepat dari cron sekali-sehari (bug
  // nyata 2026-09-21, lihat komentar ApplicationDailyStat di schema.prisma). Lihat
  // runApplicationTrafficIncrement() di src/lib/cron/application-traffic-stats.ts.
  cron.schedule(
    "7 * * * *",
    async () => {
      const { runApplicationTrafficIncrement } = await import("@/lib/cron/application-traffic-stats")
      runApplicationTrafficIncrement()
        .then((r) => console.log(`[cron] application-traffic-increment selesai: tanggal ${r.targetDateIso}, ${r.appsUpdated} aplikasi di-update`))
        .catch((e) => console.error("[cron] application-traffic-increment gagal:", e))
    },
    { timezone: "Asia/Jakarta" }
  )

  console.log(
    "[cron] Terdaftar: auto-invoice termin project (06:00), laporan pagi (07:00), laporan sore (16:00), rekap mingguan (Senin 07:30), cek biaya berkala (08:00), follow-up piutang (09:00), reminder follow up lead (tiap jam :05), backup database ke R2 (20:00), vps-monitoring ringan (tiap jam :00) + disk Docker (03:00), traffic aplikasi (tiap jam :07), retensi backup R2 (tgl 1 jam 02:00) WIB"
  )
}
