# Monitoring Server

**Cakupan:** Dokumentasi as-built untuk modul **Monitoring Server** (`/monitoring`) — beda dari file `01`–`06` di folder ini yang isinya spesifikasi modul Marketing (Simple Lead). Dokumen ini menjelaskan apa yang sudah dibangun, di file mana, dan cara meluaskannya kalau perlu.

---

## 1. Ringkasan

Modul Monitoring Server menampilkan 4 kartu di `/monitoring`:

1. **Disk Space** — penggunaan disk server tempat aplikasi ini jalan.
2. **Database Space** — ukuran database aplikasi ini sendiri + database eksternal yang ditambahkan manual.
3. **Backup Terakhir** — file backup harian terbaru yang ada di Google Drive.
4. **Login Terakhir** — kapan tiap user terakhir login ke aplikasi.

Akses modul ini dikontrol lewat `User.modules` (kolom array di tabel `users`) — user harus punya `"monitoring"` di array itu, atau role `owner` (owner selalu bypass semua gate modul). Lihat `getCurrentUser("monitoring")` di [current-user.ts](../src/lib/current-user.ts) dan helper `canViewMonitoring()` di [monitoring.ts](../src/lib/monitoring.ts) yang dipakai semua API route di bawah `/api/monitoring/*`.

Asumsi penting: **aplikasi ini jalan di server/VPS yang sama dengan yang mau dipantau** (bukan SSH ke server terpisah). Kalau suatu saat app dipindah ke server lain dari server yang mau dipantau, bagian Disk Space perlu diubah dari `exec` lokal jadi SSH remote.

---

## 2. Disk Space

- **File:** [`src/app/api/monitoring/disk/route.ts`](../src/app/api/monitoring/disk/route.ts)
- **Cara kerja:** jalankan `df -kP /` langsung di proses Node (child_process), parse baris ke-2 output (`Filesystem 1024-blocks Used Available Capacity Mounted-on`). Format `-P` dipilih karena portabel antara Linux (server) dan macOS (dev lokal).
- **Keterbatasan:** kalau container Coolify punya storage driver overlay yang membatasi kuota, angka yang tampil bisa beda dari kapasitas fisik VPS. Untuk kasus normal (tanpa quota khusus), angka ini sudah cukup akurat karena overlay filesystem container biasanya share disk fisik host.
- **Kalau butuh disk device lain** (bukan `/`), tinggal ubah argumen `df` di route ini.

## 3. Database Space

- **File:** [`src/app/api/monitoring/databases/route.ts`](../src/app/api/monitoring/databases/route.ts), [`.../[id]/route.ts`](../src/app/api/monitoring/databases/%5Bid%5D/route.ts)
- **Database aplikasi sendiri:** dihitung langsung lewat koneksi Prisma yang sudah ada (`SELECT pg_database_size(current_database())`), selalu muncul sebagai baris pertama ("Database Aplikasi (Utama)"), tidak perlu di-setup.
- **Database eksternal:** disimpan di model `MonitoredDatabase` (`prisma/schema.prisma`) — field `connectionString` berisi kredensial Postgres lengkap. **Cuma Owner** yang bisa tambah/hapus (lewat tombol "Tambah Database" di halaman, atau `POST`/`DELETE /api/monitoring/databases`), karena isinya connection string dengan password.
- Ukuran dihitung **live** tiap kali kartu ini di-refresh — connect pakai `pg.Client` langsung ke `connectionString` yang disimpan, timeout 5 detik. Kalau connect gagal (host mati, kredensial salah, dll), baris itu tampil dengan pesan error, tidak bikin seluruh kartu gagal.
- **Catatan keamanan:** connection string disimpan plaintext di tabel `monitored_databases`. Ini cukup untuk kebutuhan internal sekarang, tapi kalau nanti butuh lebih aman, pertimbangkan enkripsi kolom itu sebelum nambah database yang kredensialnya sensitif.

## 4. Backup Terakhir

- **File:** [`src/app/api/monitoring/backup/route.ts`](../src/app/api/monitoring/backup/route.ts), [`src/lib/backup/google-drive.ts`](../src/lib/backup/google-drive.ts) (fungsi `listRecentBackups`).
- Proses backup-nya sendiri **sudah ada sebelum modul monitoring ini dibangun** — lihat [`src/lib/backup/database-backup.ts`](../src/lib/backup/database-backup.ts):
  - Dijalankan otomatis tiap hari **jam 20:00 WIB** lewat `node-cron`, didaftarkan di [`instrumentation.ts`](../instrumentation.ts) saat server Next.js start.
  - Ini backup **data-only** (bukan `pg_dump`) — query semua tabel di schema `simple_system` lewat Prisma, di-JSON-kan, di-gzip, lalu diupload ke Google Drive. Skema/DDL tidak ikut di-backup karena sudah tervensiasi di `prisma/schema.prisma` + git.
  - Upload pakai OAuth ke akun Google pribadi (bukan Service Account — Service Account tidak bisa upload ke Drive akun biasa), refresh token di-generate sekali lewat `scripts/google-oauth-authorize.ts`. Env var yang dibutuhkan: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_DRIVE_BACKUP_FOLDER_ID`.
  - Bisa dipicu manual lewat tombol "Proses Backup Sekarang" di Pengaturan (owner-only) — `POST /api/backup/run`.
- **Yang ditambahkan untuk modul Monitoring:** `listRecentBackups()` me-list 5 file terbaru di folder Drive tujuan (sorted by `createdTime`), supaya kelihatan **apakah cron beneran jalan** — bukan cuma percaya cron-nya terdaftar. Kartu di UI kasih badge merah "Lebih dari 1 hari, cek cron" kalau file terbaru sudah lebih dari ~30 jam.
- **Cara restore (belum ada tombolnya, manual):** download file `.json.gz` dari Drive, extract, lalu tulis ulang tiap baris ke tabel yang sesuai (isi JSON-nya `{ schema, generatedAt, tables: { nama_tabel: [...baris] } }`). Karena ini bukan `pg_dump`, restore-nya bukan `pg_restore` — perlu script kecil yang baca JSON dan `INSERT`/`upsert` per tabel sesuai urutan foreign key. Belum ada script restore otomatis — kalau butuh, ini bagian yang perlu dibangun terpisah.

## 5. Login Terakhir

- **Kolom:** `User.lastLoginAt` (`prisma/schema.prisma`), nullable — `null` berarti belum pernah login sejak kolom ini ada (dibuat 2026-09).
- **Di-update di 2 tempat** (semua jalur yang bikin session baru): `POST /api/auth/login` dan `POST /api/auth/quick-login`. Kalau nanti ada jalur login baru, jangan lupa update juga.
- **File:** [`src/app/api/monitoring/users/route.ts`](../src/app/api/monitoring/users/route.ts) — list semua user aktif, urut dari yang paling baru login.

---

## 6. File Peta Cepat

| Bagian | API Route | UI |
|---|---|---|
| Disk Space | `GET /api/monitoring/disk` | `MonitoringDashboard.tsx` — kartu "Disk Space" |
| Database Space | `GET/POST /api/monitoring/databases`, `DELETE .../[id]` | kartu "Database Space" |
| Backup Terakhir | `GET /api/monitoring/backup` | kartu "Backup Terakhir" |
| Login Terakhir | `GET /api/monitoring/users` | kartu "Login Terakhir" |

Semua kartu ada di satu komponen client: [`src/components/monitoring/MonitoringDashboard.tsx`](../src/components/monitoring/MonitoringDashboard.tsx), dirender dari halaman server [`src/app/monitoring/page.tsx`](../src/app/monitoring/page.tsx).
