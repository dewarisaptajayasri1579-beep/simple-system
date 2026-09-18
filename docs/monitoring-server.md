# Monitoring Server

**Cakupan:** Dokumentasi as-built untuk modul **Monitoring Server** (`/monitoring`) — beda dari file `01`–`06` di folder ini yang isinya spesifikasi modul Marketing (Simple Lead). Dokumen ini menjelaskan apa yang sudah dibangun, di file mana, dan cara meluaskannya kalau perlu.

---

## 1. Ringkasan

Modul Monitoring Server punya 2 tab di `/monitoring`:

**Tab "Server Ini"** — 4 kartu buat server tempat aplikasi ini sendiri jalan:

1. **Disk Space** — penggunaan disk server tempat aplikasi ini jalan.
2. **Database Space** — ukuran database aplikasi ini sendiri + database eksternal yang ditambahkan manual.
3. **Backup Terakhir** — file backup harian terbaru yang ada di Google Drive.
4. **Login Terakhir** — kapan tiap user terakhir login ke aplikasi.

**Tab "VPS Lain"** — daftar VPS lain (mis. VPS Coolify terpisah) beserta aplikasi di masing-masing VPS: disk space & backup terakhir per VPS (lewat SSH), dan per aplikasi: domain, git repo, terakhir diakses, terakhir backup, kapan domain habis. Lihat bagian 6.

Akses modul ini dikontrol lewat `User.modules` (kolom array di tabel `users`) — user harus punya `"monitoring"` di array itu, atau role `owner` (owner selalu bypass semua gate modul). Lihat `getCurrentUser("monitoring")` di [current-user.ts](../src/lib/current-user.ts) dan helper `canViewMonitoring()` di [monitoring.ts](../src/lib/monitoring.ts) yang dipakai semua API route di bawah `/api/monitoring/*`.

Asumsi penting untuk tab "Server Ini": **aplikasi ini jalan di server/VPS yang sama dengan yang mau dipantau** (bukan SSH ke server terpisah) — bagian Disk Space di tab ini pakai `exec` lokal, bukan SSH. Untuk VPS *lain* (tab "VPS Lain"), SSH memang dipakai sejak awal — lihat bagian 6.

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

## 6. VPS Lain & Aplikasi

Tab kedua di `/monitoring` (di samping "Server Ini" yang isinya 4 kartu di atas) — buat mantau **VPS lain** (mis. 3 VPS Coolify terpisah) beserta aplikasi di masing-masing VPS.

### 6.1 Model data

- `VpsServer` (`prisma/schema.prisma`) — 1 baris per VPS. Kredensial SSH (`sshPassword`/`sshPrivateKey`, isi salah satu) dan Coolify API (`coolifyApiUrl`+`coolifyApiToken`, opsional) disimpan plaintext — sama pola risiko yang diterima seperti `MonitoredDatabase.connectionString` (lihat bagian 3). **Cuma Owner** yang bisa tambah/edit/hapus.
- `Application` — 1 baris per aplikasi di bawah sebuah `VpsServer`. `coolifyUuid` dipakai buat matching upsert saat sync dari Coolify supaya tidak dobel.

### 6.2 Disk Space & Backup per VPS (live, lewat SSH)

- **File:** [`src/lib/monitoring/ssh.ts`](../src/lib/monitoring/ssh.ts), dipanggil dari `GET /api/monitoring/vps`.
- 1 koneksi SSH per VPS (pakai `ssh2`, sudah jadi dependency) tiap kali tab "VPS Lain" di-load/refresh — jalankan `df -kP <diskPath>` buat disk usage, dan kalau `backupCheckPath` diisi, `ls -t` + `stat -c %Y` buat file terbaru di folder itu (dianggap proxy backup terakhir VPS itu). Diasumsikan VPS remote Linux (beda dari cek disk lokal yang portabel ke macOS untuk dev).
- Best-effort: kalau SSH gagal connect (kredensial salah, firewall, dst), kartu VPS itu nampilin error tapi tidak bikin VPS lain gagal (`Promise.all` per VPS).

### 6.3 Aplikasi — git repo & domain (auto-sync dari Coolify API)

- **File:** [`src/lib/monitoring/coolify.ts`](../src/lib/monitoring/coolify.ts).
- Kalau `VpsServer.coolifyApiUrl`+`coolifyApiToken` diisi, tombol "Sync dari Coolify" (atau cron harian) manggil `GET {coolifyApiUrl}/applications` — API resmi Coolify yang balikin `git_repository`, `git_branch`, `domains` per aplikasi. Field ini di-upsert ke `Application` (match by `coolifyUuid`), **field manual** (`backupLocation`, `notes`, `lastBackupAt`, `domainExpiresAt` override) **tidak pernah ditimpa** oleh sync.
- VPS tanpa kredensial Coolify: aplikasi ditambah manual lewat tombol "Aplikasi" di kartu VPS-nya.

### 6.4 Domain habis (expiry) — RDAP, best-effort

- **File:** [`src/lib/monitoring/rdap.ts`](../src/lib/monitoring/rdap.ts).
- Tiap domain aplikasi di-lookup ke `https://rdap.org/domain/<domain>` (RDAP, pengganti WHOIS, gratis tanpa API key) buat cari event `expiration`. Ada heuristik kecil (bukan Public Suffix List penuh) buat ambil "registrable domain" dari FQDN (mis. `app.contoh.co.id` → `contoh.co.id`) supaya lookup-nya benar untuk domain `.co.id` dkk.
- **Tidak semua TLD/ccTLD support RDAP** — kalau lookup gagal/kosong, field `domainExpiresAt` tetap kosong dan bisa diisi **manual** lewat form Edit Aplikasi (override, tidak akan ditimpa cron kalau sudah diisi manual... catatan: saat ini cron TETAP menimpa kalau RDAP berhasil dapat tanggal baru — kalau butuh override permanen yang tidak pernah disentuh cron, isi manual lalu jangan expect RDAP re-check lain menimpanya kecuali RDAP juga berhasil dapat tanggal).

### 6.5 Terakhir diakses — log akses Traefik, best-effort

- **File:** [`src/lib/monitoring/traefik-access.ts`](../src/lib/monitoring/traefik-access.ts).
- Coolify pakai Traefik sebagai reverse proxy default (nama container default `coolify-proxy`, bisa diubah lewat field "Nama Container Proxy" di Edit VPS kalau beda). 1 SSH call per VPS ambil `docker logs <container> --since 24h`, di-grep per domain aplikasi, ambil timestamp request terakhir (support format JSON access log Traefik & Common Log Format).
- **Asumsi/keterbatasan:** kalau access log Traefik di VPS itu tidak aktif (default Coolify mungkin tidak selalu nyalakan access log), field ini akan tetap kosong — bukan bug, memang tidak ada sumber datanya. Tidak ada fallback manual untuk field ini karena sifatnya "live traffic", beda dari expiry/backup yang make sense diisi manual.

### 6.6 Cron harian & trigger manual

- **File:** [`src/lib/cron/vps-monitoring.ts`](../src/lib/cron/vps-monitoring.ts), didaftarkan di [`instrumentation.ts`](../instrumentation.ts) jam **03:00 WIB**.
- Urutan: sync Coolify tiap VPS yang ada kredensialnya → kumpulkan semua domain unik → RDAP lookup paralel → per VPS, 1x cek log Traefik buat semua aplikasi di VPS itu sekaligus (bukan per-aplikasi, hindari banyak koneksi SSH).
- Trigger manual: tombol "Sync & Cek Sekarang" di tab VPS Lain (`POST /api/monitoring/vps/refresh-checks`, owner-only) — jalanin fungsi yang sama on-demand.

### 6.7 Peta cepat

| Bagian | API Route | Lib |
|---|---|---|
| List VPS + live disk/backup | `GET/POST /api/monitoring/vps`, `PATCH/DELETE .../[id]` | `src/lib/monitoring/ssh.ts` |
| Sync Coolify per VPS | `POST /api/monitoring/vps/[id]/sync-coolify` | `src/lib/monitoring/coolify.ts` |
| Sync & cek manual (semua VPS) | `POST /api/monitoring/vps/refresh-checks` | `src/lib/cron/vps-monitoring.ts` |
| CRUD Aplikasi manual | `POST /api/monitoring/applications`, `PATCH/DELETE .../[id]` | - |

UI: [`src/components/monitoring/VpsMonitoring.tsx`](../src/components/monitoring/VpsMonitoring.tsx), dirender sebagai tab "VPS Lain" di dalam [`MonitoringDashboard.tsx`](../src/components/monitoring/MonitoringDashboard.tsx) (tab "Server Ini" isinya 4 kartu di bagian 1-5 dokumen ini, tidak berubah).

## 7. File Peta Cepat

| Bagian | API Route | UI |
|---|---|---|
| Disk Space | `GET /api/monitoring/disk` | `MonitoringDashboard.tsx` — kartu "Disk Space" |
| Database Space | `GET/POST /api/monitoring/databases`, `DELETE .../[id]` | kartu "Database Space" |
| Backup Terakhir | `GET /api/monitoring/backup` | kartu "Backup Terakhir" |
| Login Terakhir | `GET /api/monitoring/users` | kartu "Login Terakhir" |

Semua kartu ada di satu komponen client: [`src/components/monitoring/MonitoringDashboard.tsx`](../src/components/monitoring/MonitoringDashboard.tsx), dirender dari halaman server [`src/app/monitoring/page.tsx`](../src/app/monitoring/page.tsx).
