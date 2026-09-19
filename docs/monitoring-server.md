# Monitoring Server

**Cakupan:** Dokumentasi as-built untuk modul **Monitoring Server** (`/monitoring`) — beda dari file `01`–`06` di folder ini yang isinya spesifikasi modul Marketing (Simple Lead). Dokumen ini menjelaskan apa yang sudah dibangun, di file mana, dan cara meluaskannya kalau perlu.

---

## 1. Ringkasan

Modul Monitoring Server menampilkan **satu halaman** `/monitoring` berisi **list card** — satu card per server, bisa diklik buat expand/collapse. Card pertama **selalu "Server Ini"** (server tempat aplikasi ini sendiri jalan, tidak bisa dihapus), diikuti card tiap VPS lain yang ditambahkan lewat tombol "Tambah VPS" di header (global, bukan per-card).

**Card "Server Ini"**, waktu di-expand isinya 4 bagian:

1. **Disk Space** — penggunaan disk server tempat aplikasi ini jalan.
2. **Database Space** — ukuran database aplikasi ini sendiri + database eksternal yang ditambahkan manual.
3. **Backup Terakhir** — file backup harian terbaru yang ada di Google Drive.
4. **Login Terakhir** — kapan tiap user terakhir login ke aplikasi.

Header collapsed-nya juga nampilin **IP publik** server ini (lihat bagian 6.8) dan mini disk bar.

**Card VPS lain** (mis. VPS Coolify terpisah), waktu di-expand isinya disk space & backup terakhir per VPS (lewat SSH), dan tabel aplikasi di VPS itu: domain, git repo, terakhir diakses, terakhir backup, kapan domain habis. Lihat bagian 6.

Tombol global di header halaman: **Refresh** (reload semua data), **Sync & Cek Sekarang** (owner-only, trigger cron vps-monitoring manual), **Tambah VPS** (owner-only).

Akses modul ini dikontrol lewat `User.modules` (kolom array di tabel `users`) — user harus punya `"monitoring"` di array itu, atau role `owner` (owner selalu bypass semua gate modul). Lihat `getCurrentUser("monitoring")` di [current-user.ts](../src/lib/current-user.ts) dan helper `canViewMonitoring()` di [monitoring.ts](../src/lib/monitoring.ts) yang dipakai semua API route di bawah `/api/monitoring/*`.

Asumsi penting untuk card "Server Ini": **aplikasi ini jalan di server/VPS yang sama dengan yang mau dipantau** (bukan SSH ke server terpisah) — bagian Disk Space di card ini pakai `exec` lokal, bukan SSH; IP publiknya dicek lewat layanan eksternal (ipify), bukan baca network interface lokal (yang di dalam container beda dari IP publik VPS). Untuk VPS *lain*, SSH memang dipakai sejak awal — lihat bagian 6.

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

Card kedua dan seterusnya di list `/monitoring` (setelah card "Server Ini" yang isinya 4 bagian di atas) — buat mantau **VPS lain** (mis. 3 VPS Coolify terpisah) beserta aplikasi di masing-masing VPS.

### 6.1 Model data

- `VpsServer` (`prisma/schema.prisma`) — 1 baris per VPS. Kredensial SSH (`sshPassword`/`sshPrivateKey`, isi salah satu) dan Coolify API (`coolifyApiUrl`+`coolifyApiToken`, opsional) **dienkripsi (AES-256-GCM)** sebelum disimpan — lihat [`src/lib/crypto.ts`](../src/lib/crypto.ts), `encryptSecret()`/`decryptSecret()`. Beda dari `MonitoredDatabase.connectionString` (bagian 3) yang masih plaintext apa adanya. **Cuma Owner** yang bisa tambah/edit/hapus.
  - Kunci enkripsi dari env var `ENCRYPTION_KEY` (lihat `.env.example`) — **wajib diset** di semua environment (lokal & production/Coolify), **tidak boleh berubah** setelah ada VPS tersimpan (ganti key = data lama tidak bisa didekripsi lagi, VPS harus di-edit ulang buat re-encrypt).
  - Dienkripsi di titik simpan (`POST`/`PATCH /api/monitoring/vps`), didekripsi di titik pakai (`vpsSshCreds()` di `src/lib/monitoring/ssh.ts`, `syncCoolifyApplications()` di `src/lib/monitoring/coolify.ts`) — field ini **tidak pernah** dikirim ke client (lihat `GET /api/monitoring/vps`, response-nya sengaja exclude field-field ini).
  - `decryptSecret()` fallback: kalau gagal didekripsi (mis. data lama sempat tersimpan plaintext sebelum fitur enkripsi ini ada), balikin apa adanya — supaya tidak putus, tapi berarti VPS lama tetap perlu di-edit ulang (isi ulang password/token-nya) supaya ke-enkripsi dengan skema baru.
- `Application` — 1 baris per aplikasi di bawah sebuah `VpsServer`. `coolifyUuid` dipakai buat matching upsert saat sync dari Coolify supaya tidak dobel.

### 6.2 Disk Space & Backup per VPS (live, lewat SSH)

- **File:** [`src/lib/monitoring/ssh.ts`](../src/lib/monitoring/ssh.ts), dipanggil dari `GET /api/monitoring/vps`.
- 1 koneksi SSH per VPS (pakai `ssh2`, sudah jadi dependency) tiap kali halaman `/monitoring` di-load/refresh — jalankan `df -kP <diskPath>` buat disk usage, dan kalau `backupCheckPath` diisi, `ls -t` + `stat -c %Y` buat file terbaru di folder itu (dianggap proxy backup terakhir VPS itu). Diasumsikan VPS remote Linux (beda dari cek disk lokal yang portabel ke macOS untuk dev).
- Best-effort: kalau SSH gagal connect (kredensial salah, firewall, dst), kartu VPS itu nampilin error tapi tidak bikin VPS lain gagal (`Promise.all` per VPS).

### 6.3 Disk Docker (breakdown Images/Containers/Volumes/Build Cache + "sampah") — di-cache, bukan live

- **File:** [`src/lib/monitoring/ssh.ts`](../src/lib/monitoring/ssh.ts), fungsi `getVpsDockerDiskUsage()` (jalankan `docker system df --format '{{json .}}'` + `docker ps -a -s --format '{{json .}}'`, 1 koneksi SSH terpisah dari cek disk/backup cepat di bagian 6.2).
- **Kenapa di-cache**: command ini genuinely lambat — dites di VPS Dewari butuh **~20-25 detik** (Docker harus itung ulang size semua image/volume). Kalau dijadiin live tiap load halaman kayak disk/backup biasa, `GET /api/monitoring/vps` jadi lambat semua walau cuma butuh docker info-nya kadang-kadang. Jadi dipisah:
  - `getVpsDiskAndBackup()` — CEPAT (df + backup file check saja, ~1-2 detik), tetap live tiap load halaman.
  - `getVpsDockerDiskUsage()` — LAMBAT, TIDAK dipanggil dari `GET /api/monitoring/vps`. Hasilnya disimpan di `VpsServer.dockerDiskCache` (JSON: `{ dockerDisk, appDiskUsage }`) + `dockerDiskCheckedAt`, diisi lewat:
    1. Tombol **"Cek Sekarang"** di header section "Disk Docker" tiap kartu VPS (owner-only) → `POST /api/monitoring/vps/[id]/docker-disk`.
    2. Cron harian `runVpsMonitoringRefresh()` (03:00 WIB, lihat bagian 6.7) — jadi tetap ke-refresh otomatis walau tidak ada yang klik manual.
  - `GET /api/monitoring/vps` cuma BACA cache ini (`vps.dockerDiskCache`), tidak pernah SSH buat bagian ini — makanya sekarang cepat (~1-3 detik total, dulu bisa ~24 detik).
- **UI waktu "Cek Sekarang" diklik**: tampilin progress bar animasi (`useFakeProgress()`) — BUKAN progress asli (command SSH-nya 1 blok, tidak ada laporan bertahap), cuma animasi mendekati 92% pakai kurva eksponensial mengikuti estimasi ~24 detik, lengkap teks tahapan ("Initializing…", "Menghubungkan SSH & menghitung image…", dst) biar user tidak lihat layar diam. Loncat ke selesai begitu response asli datang (lewat `onChanged()` yang refetch data beneran).
- Header section-nya juga nampilin **"Diperiksa X lalu"** (`timeAgoId()`) dari `dockerDiskCheckedAt`, atau "Belum pernah dicek" kalau cache masih kosong (VPS baru ditambah).
- Jalankan `docker system df --format '{{json .}}'` — balikin 4 baris JSON (Images, Containers, Local Volumes, Build Cache), tiap baris punya `Size` (total dipakai) dan `Reclaimable` (berapa banyak yang aman dihapus, biasanya dari image lama/dangling hasil deploy berkali-kali — bukan dari Volumes yang isinya data asli kayak database).
- **Butuh akses root ke Docker** — user SSH biasa (non-root) TIDAK punya akses ke `docker.sock`. Daripada minta user ubah keanggotaan grup di VPS-nya, command ini dibungkus `sudo -S` dengan password SSH yang sama di-pipe otomatis (`sudoWrap()`) — asumsi password sudo == password SSH (umum buat 1 akun admin). Kalau VPS pakai private-key-only (tidak ada password) atau password sudo beda, ini gagal diam-diam (cache lama tetap ditampilkan, tidak ketimpa).
- Ditampilkan di UI (`src/components/monitoring/VpsMonitoring.tsx`, `DOCKER_TYPE_META`) sebagai list 4 baris progress bar di bawah bar Disk Space tiap kartu VPS. Tiap kategori punya warna beda (Images amber, Containers biru, Local Volumes hijau, Build Cache ungu) dan 1 baris deskripsi singkat di bawahnya menjelaskan artinya buat yang belum familiar istilah Docker-nya. Lebar bar proporsional ke ukuran relatif tiap kategori (bukan ke reclaimable) — info reclaimable ("sampah") ditulis di teks sebelah kanan tiap baris.
- **Breakdown per-volume** (khusus baris "Local Volumes") — jalankan command ke-3, `docker system df -v --format '{{json .}}'` (fungsi `parseDockerVolumes()`), BEDA dari `docker system df` biasa: `-v` balikin 1 objek JSON tunggal berisi array `Images`/`Containers`/`Volumes`/`BuildCache`, cuma `.Volumes` yang dipakai (nama + size tiap volume). Ini yang **mengungkap kasus nyata**: agregat "Local Volumes" bisa kelihatan wajar padahal isinya didominasi 1 volume yang bengkak — di VPS Dewari, volume `buildx_buildkit_coolify-railpack0_state` (cache BuildKit dari proses build, **BUKAN data aplikasi/database**) sendirian menyumbang puluhan GB dari total "Local Volumes", jauh di atas volume data Postgres yang cuma puluhan-ratusan MB masing-masing. Ditampilkan sebagai list kecil (diurutkan dari yang paling besar, maks 8 ditampilkan + keterangan sisanya) di bawah baris "Local Volumes".
- **Dampak ke waktu eksekusi**: nambah 1 command lagi ke `getVpsDockerDiskUsage()` bikin totalnya makin lama (~30-70+ detik tergantung jumlah image/volume), timeout dinaikkan ke **90 detik**, estimasi progress bar di UI disesuaikan jadi ~50 detik.
- Bar **Disk Space utama** (yang nunjukkin `df`) juga di-highlight bertingkat 3 warna berdasarkan data breakdown ini: biru = porsi Local Volumes, oranye = porsi Images yang reclaimable, abu-abu = sisa terpakai lainnya (OS, image aktif, container). Fallback ke bar 1 warna polos kalau `dockerDisk` null (belum pernah dicek).
- **Ringkasan jumlah Aplikasi & Database**: 2 kartu kecil di atas tiap kartu VPS — "Aplikasi" dari `vps.applications.length` (tabel kita sendiri), "Database (Coolify)" dari `VpsServer.coolifyDatabaseCount` (diisi tiap kali `fetchDatabases()` di sync Coolify BENERAN berhasil — biar kegagalan sesaat tidak nge-reset ke 0).
- **Belum ada tombol hapus otomatis** dari sini (sengaja, karena destructive) — Coolify sendiri sebenarnya sudah punya auto-cleanup bawaan (lihat setting `docker_cleanup_threshold`/`docker_cleanup_frequency` di server settings-nya, defaultnya cuma jalan kalau disk usage > 80%), jadi kalau butuh bersih-bersih manual sebelum itu, masih perlu `docker image prune -af` manual lewat SSH langsung.
- **Disk per aplikasi DAN per database** (bukan cuma agregat VPS): dari command yang sama di `getVpsDockerDiskUsage()`, jalankan juga `docker ps -a -s --format '{{json .}}'` (fungsi `parseDockerPsLine()`) — sekarang menangkap **SEMUA container** (`ContainerDiskEntry[]`, field `containerName`), bukan cuma yang berlabel aplikasi.
  - **Container aplikasi**: Coolify nandain dengan label `coolify.name=<uuid>` (field `coolifyAppUuid`) — cocok dengan `Application.coolifyUuid`.
  - **Container database**: TIDAK punya label `coolify.name`, tapi nama container-nya (`containerName`) PERSIS uuid resource database itu (tanpa suffix acak) — cocok dengan `Application.databaseUuid` (field baru, diisi bareng `databaseInfo` waktu sync Coolify, lihat bagian 6.4).
  - Matching dilakukan di `GET /api/monitoring/vps` (baca dari cache `containers`, bukan live), hasilnya 2 field per aplikasi: `diskUsage` (disk aplikasinya) dan `databaseDiskUsage` (disk database yang dipakainya) — masing-masing `{ size, virtualSize }`. `size` = writable layer (biasanya kecil, cuma dipakai buat tooltip), `virtualSize` = total image+layer — **cuma perkiraan kasar** karena base layer bisa dipakai bareng beberapa aplikasi/database sekaligus (bukan porsi eksklusif dari total disk VPS).
  - **Ditampilkan menyatu di kolom masing-masing** (bukan kolom "Disk" terpisah) — disk aplikasi muncul di kolom **Aplikasi** (di bawah nama), disk database muncul di kolom **Git / Database** (di bawah `databaseInfo`). Formatnya `~<virtualSize> (X% dari total)` — persentase dihitung client-side dari `disk.totalBytes` VPS itu (komponen `DiskContribution` di `VpsMonitoring.tsx`), warna teks kontras (`text-slate-700`, bukan abu-abu pudar) karena awalnya kurang kebaca.
  - Kosong (`-`) kalau aplikasi/database belum pernah sync dari Coolify, container-nya tidak ketemu (mis. sedang tidak jalan), atau cache disk Docker VPS itu belum pernah di-"Cek Sekarang".

### 6.4 Aplikasi — git repo & domain (auto-sync dari Coolify API)

- **Layout tabel** (`src/components/monitoring/VpsMonitoring.tsx`) — kolom digabung biar tidak kebanyakan kolom sempit: **#** (nomor urut), **Aplikasi** (nama + badge Coolify + disk aplikasi), **Git / Database** (nama repo git dari `repoDisplayName()` + branch + info database + disk database), **Diakses / Backup** (terakhir diakses+siapa, terakhir backup+lokasi), **Domain Habis** (domain + badge expiry), **Aksi** (owner-only). Tidak ada kolom "Disk" terpisah — disk usage menyatu ke kolom Aplikasi/Database masing-masing (lihat bagian 6.3).
- **File:** [`src/lib/monitoring/coolify.ts`](../src/lib/monitoring/coolify.ts).
- Kalau `VpsServer.coolifyApiUrl`+`coolifyApiToken` diisi, tombol "Sync dari Coolify" (atau cron harian) manggil `GET {coolifyApiUrl}/applications` — API resmi Coolify yang balikin `git_repository`, `git_branch`, `domains` per aplikasi. URL di-normalisasi otomatis (`normalizeCoolifyApiUrl()`) — user boleh isi domain root Coolify tanpa tahu harus diakhiri `/api/v1`, ditambahkan otomatis kalau belum ada. Field ini di-upsert ke `Application` (match by `coolifyUuid`), **field manual** (`backupLocation`, `notes`, `lastBackupAt`, `domainExpiresAt` override) **tidak pernah ditimpa** oleh sync.
- VPS tanpa kredensial Coolify: aplikasi ditambah manual lewat tombol "Aplikasi" di kartu VPS-nya.
- **Info Database per aplikasi** (`Application.databaseInfo`): dicocokkan otomatis saat sync — untuk tiap aplikasi, ambil env var yang namanya mengandung `DATABASE_URL`/`DB_URL`/`POSTGRES_URL`/dst lewat `GET /applications/{uuid}/envs`, ambil hostname dari connection string-nya, cocokkan ke `uuid` salah satu resource di `GET /databases` (Coolify pakai UUID resource sebagai alias hostname internal Docker-nya). Hasilnya cuma label singkat (mis. "PostgreSQL — postgres-simple-system") yang disimpan — **password/connection string lengkap dari env var TIDAK PERNAH disimpan**, cuma dipakai sesaat waktu sync lalu dibuang.
  - **Butuh permission token `read:sensitive`** (selain `read`) — tanpa itu, Coolify tidak mengirim field `value`/`real_value` env sama sekali (bukan disensor, memang tidak ada di response), jadi `databaseInfo` akan tetap kosong. Ini konsekuensi keamanan yang harus disadari user: token dengan `read:sensitive` bisa melihat semua secret/password di semua aplikasi Coolify itu, bukan cuma connection string DB.
  - Best-effort penuh di tiap tahap (fetch `/databases` gagal, fetch envs 1 aplikasi gagal, tidak ketemu match) — tidak menggagalkan sync aplikasi lain, dan tidak menghapus `databaseInfo` yang sudah pernah berhasil ke-set sebelumnya kalau sync berikutnya gagal cocok.

### 6.5 Domain habis (expiry) — RDAP, best-effort

- **File:** [`src/lib/monitoring/rdap.ts`](../src/lib/monitoring/rdap.ts).
- Tiap domain aplikasi di-lookup ke `https://rdap.org/domain/<domain>` (RDAP, pengganti WHOIS, gratis tanpa API key) buat cari event `expiration`. Ada heuristik kecil (bukan Public Suffix List penuh) buat ambil "registrable domain" dari FQDN (mis. `app.contoh.co.id` → `contoh.co.id`) supaya lookup-nya benar untuk domain `.co.id` dkk.
- **Tidak semua TLD/ccTLD support RDAP** — kalau lookup gagal/kosong, field `domainExpiresAt` tetap kosong dan bisa diisi **manual** lewat form Edit Aplikasi (override, tidak akan ditimpa cron kalau sudah diisi manual... catatan: saat ini cron TETAP menimpa kalau RDAP berhasil dapat tanggal baru — kalau butuh override permanen yang tidak pernah disentuh cron, isi manual lalu jangan expect RDAP re-check lain menimpanya kecuali RDAP juga berhasil dapat tanggal).

### 6.6 Terakhir diakses — 2 sumber, query database (akurat) lebih diutamakan dari log Traefik (tebakan)

Ada 2 cara field `lastAccessedAt` (+ `lastAccessedBy`) bisa keisi, **query database kalau ada, kalau tidak baru fallback ke log Traefik**:

**A. Query manual ke database aplikasi (`Application.activityQuery`) — akurat, tahu siapa user-nya**
- Field ini diisi **manual** oleh user lewat form Edit Aplikasi — SQL bebas asal diawali `SELECT`, kolom pertama hasil query dianggap identitas user (email/nama), kolom kedua dianggap timestamp. Contoh: `SELECT email, last_login_at FROM users ORDER BY last_login_at DESC LIMIT 1`.
- Dijalankan di [`src/lib/monitoring/coolify.ts`](../src/lib/monitoring/coolify.ts) fungsi `runActivityQuery()`, **cuma waktu sync Coolify jalan** (tombol "Sync dari Coolify" / cron / "Sync & Cek Sekarang") — bukan tiap load halaman. Connection string diambil sesaat dari env `*_DATABASE_URL` aplikasi itu (sama proses yang dipakai buat `databaseInfo`, lihat bagian 6.4) — **tidak pernah disimpan**, cuma dipakai connect sesaat lalu dibuang.
- Prasyarat: `databaseInfo` aplikasi itu harus berhasil ke-match dulu (butuh token Coolify dengan `read:sensitive`, lihat bagian 6.4) — kalau tidak ada `DATABASE_URL` yang kebaca, query ini tidak akan pernah jalan.
- Hasil dari sumber ini **diprioritaskan** — cron `vps-monitoring` (lihat 6.6) sengaja SKIP update dari log Traefik untuk aplikasi yang punya `activityQuery` terisi, supaya tidak ditimpa tebakan yang kurang akurat.

**B. Log akses Traefik (fallback generik, cuma tahu "ada request", bukan siapa)**
- **File:** [`src/lib/monitoring/traefik-access.ts`](../src/lib/monitoring/traefik-access.ts).
- Dipakai otomatis untuk aplikasi yang **tidak** punya `activityQuery`. Coolify pakai Traefik sebagai reverse proxy default (nama container default `coolify-proxy`, bisa diubah lewat field "Nama Container Proxy" di Edit VPS kalau beda) — SEMUA traffic HTTP ke semua aplikasi di VPS itu lewat 1 container ini. 1 SSH call per VPS ambil `docker logs <container> --since 24h`, di-grep per domain aplikasi, ambil timestamp request terakhir (support format JSON access log Traefik & Common Log Format).
- **Butuh user SSH itu jadi anggota grup `docker` di VPS** (`sudo usermod -aG docker <user>`) — tanpa itu `docker logs` gagal "permission denied", best-effort jadi diam-diam tidak keisi.
- **Asumsi/keterbatasan:** kalau access log Traefik di VPS itu tidak aktif (default Coolify mungkin tidak selalu nyalakan access log), field ini akan tetap kosong — bukan bug, memang tidak ada sumber datanya. `lastAccessedBy` selalu kosong dari sumber ini (Traefik cuma tahu domain yang diminta, bukan identitas user).

### 6.7 Cron harian & trigger manual

- **File:** [`src/lib/cron/vps-monitoring.ts`](../src/lib/cron/vps-monitoring.ts), didaftarkan di [`instrumentation.ts`](../instrumentation.ts) jam **03:00 WIB**.
- Urutan: sync Coolify tiap VPS yang ada kredensialnya → kumpulkan semua domain unik → RDAP lookup paralel → per VPS, 1x cek log Traefik buat semua aplikasi di VPS itu sekaligus (bukan per-aplikasi, hindari banyak koneksi SSH).
- Trigger manual: tombol "Sync & Cek Sekarang" di header halaman (`POST /api/monitoring/vps/refresh-checks`, owner-only) — jalanin fungsi yang sama on-demand.

### 6.8 IP publik "Server Ini"

- **File:** [`src/app/api/monitoring/disk/route.ts`](../src/app/api/monitoring/disk/route.ts), fungsi `getPublicIp()`.
- Tidak ada cara baca IP publik VPS dari dalam proses Node (container Coolify biasanya di belakang NAT — IP internal beda dari IP publik VPS-nya), jadi dicek lewat `https://api.ipify.org?format=json`. Best-effort: gagal fetch (mis. offline) cuma bikin header card "Server Ini" nampilin "IP tidak diketahui", tidak menggagalkan disk check.
- Response `GET /api/monitoring/disk` sekarang bentuknya `{ disk, diskError, ip, ipError }` (sebelumnya field disk flat langsung di root) — cuma dipakai internal oleh `MonitoringDashboard.tsx`, tidak ada konsumer lain.

### 6.9 Peta cepat

| Bagian | API Route | Lib |
|---|---|---|
| List VPS + live disk/backup | `GET/POST /api/monitoring/vps`, `PATCH/DELETE .../[id]` | `src/lib/monitoring/ssh.ts` |
| Sync Coolify per VPS | `POST /api/monitoring/vps/[id]/sync-coolify` | `src/lib/monitoring/coolify.ts` |
| Sync & cek manual (semua VPS) | `POST /api/monitoring/vps/refresh-checks` | `src/lib/cron/vps-monitoring.ts` |
| CRUD Aplikasi manual | `POST /api/monitoring/applications`, `PATCH/DELETE .../[id]` | - |

UI: [`src/components/monitoring/VpsMonitoring.tsx`](../src/components/monitoring/VpsMonitoring.tsx) mengekspor `VpsServerCard` (satu card VPS, collapsible) dipakai di dalam list card [`MonitoringDashboard.tsx`](../src/components/monitoring/MonitoringDashboard.tsx) — file itu juga yang render card "Server Ini" (bagian 1-5 dokumen ini) sebagai card pertama di list yang sama.

## 7. File Peta Cepat

| Bagian | API Route | UI |
|---|---|---|
| Disk Space | `GET /api/monitoring/disk` | `MonitoringDashboard.tsx` — kartu "Disk Space" |
| Database Space | `GET/POST /api/monitoring/databases`, `DELETE .../[id]` | kartu "Database Space" |
| Backup Terakhir | `GET /api/monitoring/backup` | kartu "Backup Terakhir" |
| Login Terakhir | `GET /api/monitoring/users` | kartu "Login Terakhir" |

Semua kartu ada di satu komponen client: [`src/components/monitoring/MonitoringDashboard.tsx`](../src/components/monitoring/MonitoringDashboard.tsx), dirender dari halaman server [`src/app/monitoring/page.tsx`](../src/app/monitoring/page.tsx).
