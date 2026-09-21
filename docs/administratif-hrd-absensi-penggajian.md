# Administratif — HRD: Absensi & Penggajian (Alur Aplikasi Lama, Terverifikasi)

**Status:** Alur bisnis sudah dipelajari dari source code aplikasi lama (Web CodeIgniter 3 +
Android Flutter, project **"Fast Absensi"**) dan **diverifikasi langsung dari dump database
produksi** (bukan tebakan dari kode saja). Sumber riset lengkap ada di
`~/Documents/Projects/ABSENSI/docs/` (5 dokumen + data export SQL/CSV) — dokumen ini
merangkum bagian yang relevan buat desain ulang di Modul Administratif (`/administratif`).
Yang masih terbuka adalah **keputusan bisnis** untuk sistem baru (lihat bagian 5), bukan lagi
"belum tahu alurnya seperti apa".

**Cakupan:** beda dari `01`–`06` (spek modul Marketing/Simple Lead) dan `monitoring-server.md`
(as-built Monitoring). Dokumen ini untuk 2 proses baru di Modul Administratif — lihat
[current-user.ts](../src/lib/current-user.ts). Fondasi yang sudah ada: model `Employee` (data
karyawan) dan `CorrespondenceLog` (surat-menyurat) di `prisma/schema.prisma`.

---

## 0. Ringkasan Arsitektur Aplikasi Lama

- **Web** (CodeIgniter 3, PHP) — backend + admin web. Menangani absensi (rekap, koreksi
  manual, pengajuan izin) **dan** seluruh penggajian.
- **Android** (Flutter, dibangun di atas template "MediLab" yang disisipi modul absensi
  kustom) — dipakai karyawan cuma untuk **absen masuk/pulang + kunjungan toko (sales)**.
  Tidak ada penggajian, tidak ada pengajuan izin/cuti/lembur di app.
- Endpoint Android semuanya lewat 1 controller: `Parse_android.php`, logika sesungguhnya
  ada di helper `androweb_helper.php` (proses absen) dan `pos_helper.php` (bantu hitung).
- 1 tabel `m_log` dipakai untuk **2 konsep berbeda** lewat kolom `jenis`: `jenis=1` = absen
  kepegawaian, `jenis=2` = kunjungan toko sales/SPG (bukan absensi kantor). Ini pola lama
  yang **tidak perlu dibawa** ke sistem baru — pisahkan jadi 2 tabel/konsep sejak awal.

---

## 1. Proses Absensi

### 1.1 Aktor
- **Karyawan** — absen masuk/pulang lewat app Android.
- **HR/Admin (web)** — input koreksi manual, lihat rekap, input pengajuan izin/sakit/cuti
  (bukan karyawan sendiri — lihat 1.4).

### 1.2 Alur Absen Masuk/Pulang (Android → Web)
1. **Login**: `POST Parse_android/loginAndroid` (`tokenaplikasi`, `username`, `password`,
   `firebasetoken`). Backend generate token sesi baru — **single-device login**, token
   lama otomatis invalid begitu login di device lain.
2. **Home**: app tarik status hari ini lewat `Parse_android/infoLog` (`status_check_in`,
   jam masuk/pulang, `temp_idcheckin`).
3. **Absen Masuk** (`Parse_android/saveAbsenMasuk`):
   - Wajib kirim `lat`, `lng`, `address_data` (hasil reverse-geocoding di app) + foto
     (multipart) dari **kamera langsung** (tidak bisa dari galeri), otomatis diberi
     **watermark** (alamat, nama, koordinat, waktu) — ini satu-satunya "bukti", **bukan**
     face-recognition/liveness.
   - Validasi duplikat: kalau status hari ini sudah `"I"` → error "Sudah Absen Masuk";
     kalau sudah `"C"` → error "Sudah Absen Pulang".
   - Server hitung keterlambatan: `jam absen > jam_masuk (ketentuan)` → tandai telat +
     simpan selisihnya. **Sabtu dikecualikan** dari perhitungan telat (Minggu tidak
     disebut eksplisit di kode).
4. **Absen Pulang** (`Parse_android/saveAbsenPulang`) — pola sama, hitung
   `work_duration` = selisih jam masuk–pulang, dan pulang cepat/lembur (lembur dihitung
   ulang lebih detail saat proses payroll, bukan di sini).
5. Semua perhitungan waktu (telat, durasi, lembur) dilakukan **di server**, bukan di app —
   app cuma validasi field wajib (client-side saja).

### 1.3 Yang TIDAK Ada / Tidak Aktif (penting — jangan diasumsikan ada)
- **Validasi radius/geofence lokasi**: kolom `ketentuan.toleransijarak` (real value: **100
  meter**) ada, tapi **pengecekannya di-comment di kode backend** — karyawan bisa absen dari
  lokasi manapun asal GPS aktif. Android juga tidak validasi radius di client.
- **Deteksi fake-GPS** (`isMocked`) ada di Android tapi hasilnya **tidak dipakai** untuk
  menghentikan proses (dead code).
- **Face recognition/liveness**: tidak ada sama sekali, meski ada permission
  `USE_BIOMETRIC` di manifest Android (tidak dipakai di kode Dart).
- **Multi-shift**: tidak ditemukan modul jadwal/shift kerja — semua karyawan pakai 1 jam
  kerja tunggal per tenant (lihat 1.4).

### 1.4 Pengajuan Izin/Sakit/Cuti
- **Hanya bisa diinput lewat web admin oleh HR** — tidak ada endpoint pengajuan izin di
  Android sama sekali. Karyawan tidak bisa self-service ajukan izin dari HP.
- Tabel `m_pengajuanijin`: `tgl_ijin`, `idpegawai`, `idjenisijin` (FK `m_jenisijin`:
  SAKIT/IJIN/dst), `keterangan`, `status`, `status_approve`.
- **🔴 Approval izin 0% pernah dipakai** — dikonfirmasi dari 258 baris data produksi:
  `status` selalu `"O"`, `status_approve` selalu `NULL`. Begitu HR input, langsung
  dianggap sah dan dipakai penuh di perhitungan payroll — **tidak ada gate approval
  aktif di sistem lama**, meski field-nya ada di skema.
- Setting `ketentuan.pengajuanijin_sebelumharih` (real: **H-2**, batas hari pengajuan
  sebelum tanggal izin) ada tapi **tidak divalidasi** di backend.

### 1.5 Setting Global (`ketentuan`, 1 baris per tenant) — Nilai Real Terverifikasi
| Kolom | Nilai Real | Catatan |
|---|---|---|
| `jam_masuk` | **07:45:00** | Bukan 08:00 seperti default di kode |
| `jam_pulang` | **16:45:00** | Bukan 17:00 seperti default di kode |
| `toleransijarak` | 100 (meter) | Dikonfigurasi tapi tidak ditegakkan |
| `pengajuanijin_sebelumharih` | 2 (hari) | Tidak divalidasi |
| `tglcutoff` | 25 | Tanggal cut-off periode payroll (lihat bagian 2) |
| `nominallembur` | 173 | Konstanta resmi Kepmenakertrans No.102/MEN/VI/2004 (1 jam = 1/173 gaji bulanan) — **pertahankan** kalau mau tetap pakai formula ini |
| `persenpph` | 0.00 | PPh21 saat ini dimatikan untuk tenant ini |
| `premikehadiran` | 100000 | ⚠️ **Bug**: kode payroll pakai hardcode `Rp 100.000` terpisah, **mengabaikan** kolom ini — kalau admin ubah nilainya di UI lama, tidak berpengaruh ke hasil hitung |

⚠️ **Bug nyata yang jangan dibawa ke sistem baru**: pengecekan "telat" harian pakai
`ketentuan.jam_masuk` (07:45), tapi pengecekan "telat" untuk premi kehadiran bulanan di
proses payroll pakai **hardcode terpisah** `08:00:00`/`17:00:00` — dua sumber kebenaran
berbeda untuk aturan yang sama. **Sistem baru harus punya satu sumber konfigurasi jam
kerja** dipakai konsisten di semua kalkulasi.

### 1.6 Kolom yang Ada di Skema Tapi Tidak Pernah Dipakai
4 kolom di `m_user` ada di database tapi **0 referensi** di seluruh codebase — kemungkinan
kebutuhan bisnis nyata yang belum sempat dibangun:
- `ytpotonganlate` — harusnya toggle "kecualikan karyawan ini dari potongan telat"
- `ythitunglembur` — harusnya toggle "hitung lembur untuk karyawan ini"
- `ytlembursetengah` — harusnya rate lembur setengah untuk karyawan tertentu
- `ytmasukharisabtu` — harusnya override "Sabtu hari kerja" per individu (saat ini
  exclude-Sabtu berlaku sama untuk SEMUA karyawan secara global)

**Perlu ditanyakan ke user/HR**: apakah pengecualian per-karyawan ini memang dibutuhkan di
sistem baru? Kalau ya, ini fitur baru untuk dibangun dari nol, bukan migrasi — logikanya
belum pernah ada di sistem lama.

### 1.7 Data Quality — Penting untuk Migrasi
- Tabel `m_log` (jantung data absensi) berisi **19.215 baris**, tapi **53% (10.226 baris)
  adalah baris "shell" kosong** (`jenis IS NULL`) — dibuat otomatis sistem tiap hari
  (`checkTempIdLog()`) tapi karyawan tidak pernah lanjut absen. **Bukan data absensi
  asli** — kalau ada migrasi data historis, baris ini harus difilter dulu.
- Koordinat GPS (`lat`/`lng`) disimpan sebagai **varchar**, bukan angka — perlu dikonversi
  ke `numeric`/`decimal` kalau mau query jarak secara native di Postgres.

---

## 2. Proses Penggajian

**Catatan penting**: modul ini **100% cuma ada di Web**, tidak ada sama sekali di Android
(karyawan tidak bisa lihat slip gaji dari HP — cuma HR/Finance yang akses lewat web admin).

### 2.1 Aktor
- **HR/Finance** — proses hitung bulanan (mode "simpan"), review, lalu finalisasi
  (mode "posting").
- **Karyawan** — tidak terlibat langsung di sistem (terima slip gaji fisik/PDF di luar
  aplikasi, kemungkinan by-hand atau email — tidak ada distribusi digital in-app).

### 2.2 Siklus & Periode
- Cut-off ditentukan `ketentuan.tglcutoff` (real: **tanggal 25**).
- Periode = `(tglcutoff+1, bulan lalu)` s.d. `(tglcutoff, bulan ini)`. Contoh: cutoff=25,
  proses bulan `2023-06` → periode absensi `2023-05-26` s.d. `2023-06-25`.
- Endpoint proses: `hq/inputpenggajian/savemaster/{mode}`:
  - **`simpan`** — hitung ulang dari nol (hapus semua detail lama periode itu, hitung ulang).
  - **`posting`** — finalisasi: dokumen jadi `status="C"` (closed/lock), semua komponen
    variabel (fee/potongan/cicilan) yang dipakai bulan itu ditandai terpakai, tidak bisa
    dipakai ulang.

### 2.3 Alur Hitung (Mode "simpan")
1. Ambil semua karyawan aktif (`ispegawai='Y' AND isaktif='Y'`).
2. Hitung `jmlhariefektif` = hari kerja dalam periode (bukan Sabtu/Minggu, bukan tanggal
   libur nasional dari `m_tglliburnasional`).
3. **Per karyawan**, kumpulkan komponen:
   - Gaji pokok & tunjangan tetap (jabatan, BPJS Kesehatan/Ketenagakerjaan) — dari master
     `t_gajikaryawandet`.
   - Fee/Potongan/Maintenance — dari `t_variablegajidet` (sistem **cicilan/tenor**
     per bulan; begitu posting, entri ditandai `status='C'` terpakai).
   - Tunjangan kehadiran & transport — dari `m_perdinjabatan`, per jabatan, dikali
     jumlah hari hadir.
   - Ijin/Sakit — dari `m_pengajuanijin` (lihat catatan approval di 1.4 — semua yang
     terinput dianggap sah tanpa gate).
4. **Perhitungan harian** (loop tiap tanggal dalam periode, per karyawan):
   - Kalau ada data absen: `jamdur` (durasi kerja) → lembur jika `jamdur >= 11` jam
     (`jmljamlembur = jamdur - 9`); dianggap hadir (`ishadir`) jika `jamdur >= 4` jam atau
     ada perjalanan dinas; tunjangan harian diberikan penuh kalau `jamdur >= 9` jam.
   - **Gaji pokok harian** = `min(jamdur, 9) / 9 / jmlhariefektif × gajipokok_bulanan`.
   - `latepotongan` (potongan kekurangan jam) = porsi gaji harian penuh − gaji pokok
     harian aktual.
   - Kalau **tidak ada** data absen sama sekali di hari itu (alfa): semua tunjangan
     harian = 0, `latepotongan` = seluruh porsi gaji hari itu.
5. **Alfa** = `jmlhariefektif − sakit − ijin − jumlahkehadiran` (bukan input eksplisit,
   hasil sisa).
6. **Prorate**: kalau flag `ytprorate='Y'` di karyawan, gaji pokok final dihitung ulang
   proporsional terhadap kehadiran (`jumlahkehadiran / jmlhariefektif × gajipokok`).
7. **Premi kehadiran**: Rp 100.000 kalau hadir 100% hari efektif **dan** tidak pernah
   telat/pulang cepat (lihat catatan bug hardcode di 1.5).
8. **Formula akhir**:
   ```
   Pendapatan = gajipokok + tunjangankehadiran + tunjangantransport + tunjanganjabatan
              + tunjanganbpjskesehatan + tunjanganbpjsketenagakerjaan + totalfee
              + totalmaintenance + totalperdin + uanglembur + premikehadiran

   Potongan   = bpjskesehatan + bpjsketenagakerjaan + totalpotongan + latepotongan + pph21

   Take-Home Pay = Pendapatan − Potongan
   ```
   - Lembur: `ulembur = gajipokok / 173 × jmljamlembur` (konstanta Kepmenakertrans; tidak
     berlaku untuk karyawan prorate).
   - PPh21: `persenpph × gajipokok hasil hitung` — flat %, **bukan** skema PTKP/TER
     progresif resmi (saat ini `persenpph=0`, jadi efektif tidak berjalan untuk tenant ini).

### 2.4 Output
- **Slip Gaji** (PDF, terenkripsi RC4) — rincian pendapatan/potongan/take-home + terbilang.
  Nama tanda tangan Finance & Direktur **di-hardcode di kode PHP** (bukan dari config).
- **Rekap Absensi** (PDF) — tabel harian per karyawan (jam masuk/pulang, alamat, durasi,
  lembur, tunjangan, late charge) + foto bukti absen.

### 2.5 ⚠️ Modul "Pembayaran Gaji Karyawan" — JANGAN Dijadikan Referensi
Ada modul terpisah (`Penggajiankaryawan.php`, tabel `t_bayargajikaryawan*`) yang
kelihatannya dimaksudkan untuk proses *disbursement* aktual (potong kasbon + BPJS,
hitung nominal transfer per karyawan setelah payroll dihitung) — **tapi rusak total**:
- Query mengasumsikan kolom (`gaji`, `gajilaporbpjs`) yang **tidak ada** di skema
  tabel sebenarnya.
- Bergantung tabel `m_iuranbpjs` yang **tidak ada** di database.
- Logic potong kasbon **di-comment total** (`$kasbon = 0` hardcode).
- **Tidak punya entri di menu produksi** — sama sekali tidak bisa diakses dari UI.
- Kesimpulan: fitur pembayaran gaji aktual (termasuk potong kasbon) **tidak pernah
  benar-benar berjalan di sistem lama**. Kalau bisnis butuh ini di sistem baru, harus
  didesain dari kebutuhan riil, bukan migrasi kode existing.

### 2.6 Kasus Nyata yang Perlu Diantisipasi
Dari data produksi real:
- Karyawan alfa 22 hari sebulan (tidak masuk sama sekali) tapi tetap punya `terima`
  positif karena ada komponen fee/tunjangan lain.
- Karyawan dengan `terima` **negatif** (potongan lebih besar dari pendapatan bulan itu)
  — sistem lama tidak menangani ini secara eksplisit (dibiarkan negatif di slip).

---

## 3. Menu & Struktur (as-built, referensi kalau mau samakan pengelompokan)

```
Absence (top menu)
├── Map Activity          → LAPORAN (peta lokasi check-in/out)
├── Pegawai               → MASTER DATA (karyawan)
├── Input Absen Manual    → TRANSAKSI (koreksi manual oleh HR)
├── Absence Website       → TRANSAKSI (kunjungan toko/sales, web)
├── Report → Absen Team   → LAPORAN (rekap absensi)
└── Setting
    ├── Ketentuan             → MASTER DATA (aturan global)
    ├── Tgl Libur Nasional    → MASTER DATA
    ├── Jenis Ijin            → MASTER DATA
    └── Pengajuan Ijin        → TRANSAKSI

Penggajian (top menu)
├── Master Gaji Karyawan      → MASTER DATA
├── Jenis Variable            → MASTER DATA
├── Transaksi Variable Gaji   → TRANSAKSI (fee/potongan/maintenance, cicilan)
├── Variable Per Jabatan      → MASTER DATA (tunjangan per jabatan)
├── Input Perdin              → TRANSAKSI (perjalanan dinas)
└── Penggajian Karyawan       → TRANSAKSI + LAPORAN (mesin hitung + cetak slip)
```

Laporan yang ada murni operasional (rekap harian + slip gaji) — **tidak ada** dashboard
analitik/BI kehadiran atau laporan lembur agregat di sistem lama.

---

## 4. Data Historis untuk Migrasi

Data produksi sudah diekspor lengkap ke:
- `~/Documents/Projects/ABSENSI/docs/data-export/absensi_penggajian_export.sql` — dump
  SQL 23 tabel terkait Absensi & Penggajian (~21MB, schema + data).
- `~/Documents/Projects/ABSENSI/docs/data-export/csv/*.csv` — 1 file per tabel (untuk
  inspeksi cepat saja, bukan sumber migrasi utama — konversi tab→koma sederhana bisa
  shift kolom kalau ada teks mengandung koma).

Kalau nanti perlu migrasi data historis (bukan cuma alur baru), pakai file `.sql` di atas
sebagai sumber, dengan catatan **filter baris `m_log` yang `jenis IS NULL`** (lihat 1.7).

---

## 5. Keputusan Bisnis yang Perlu Diambil untuk Sistem Baru

Ini bukan lagi "belum tahu alurnya" — alurnya sudah jelas dari riset di atas. Yang tersisa
murni **keputusan desain**, karena beberapa hal di sistem lama sengaja tidak dibawa
apa adanya (rusak, tidak lengkap, atau tidak sesuai kebutuhan saat ini):

1. **Approval izin/cuti** — sistem lama 0% pernah dipakai (langsung sah begitu HR input).
   Apakah sistem baru **mau** approval sungguhan (mis. atasan approve di app/web), atau
   tetap seperti sekarang (HR input = langsung sah)?
2. **Self-service pengajuan izin dari Android** — sekarang cuma bisa lewat web oleh HR.
   Apakah karyawan mau bisa ajukan izin/cuti langsung dari HP?
3. **Validasi radius lokasi (geofence)** — datanya sudah ada (100m), tinggal diaktifkan
   kalau mau. Aktifkan atau tetap longgar seperti sekarang?
4. **Override aturan per-karyawan** (potongan telat, lembur, kerja Sabtu) — 4 kolom ada
   di skema lama tapi tidak pernah dipakai (lihat 1.6). Dibutuhkan atau tidak?
5. **PPh21** — sistem lama flat % dan sedang 0%. Kalau compliance pajak penting, pakai
   skema **TER 2024** resmi, bukan replikasi logika lama.
6. **Kasus gaji negatif** — dibawa sebagai hutang ke bulan berikutnya, atau dibiarkan
   negatif di slip seperti sekarang?
7. **Pembayaran gaji aktual + potong Kasbon** — modul lama rusak/tidak terpakai (2.5).
   Sistem baru sudah punya model `Kasbon` (terhubung ke `User`, dipakai staf Internal
   yang punya login) — perlu diputuskan: apakah semua karyawan HRD juga akan punya akun
   `User`, atau `Employee` tetap terpisah dari `User` dan butuh mekanisme potongan
   kasbon sendiri yang tidak bergantung pada login sistem?
8. **Distribusi slip gaji** — lama cuma PDF via web admin, karyawan tidak akses in-app.
   Apakah sistem baru mau kasih akses karyawan lihat slip sendiri (mis. lewat Modul
   Administratif kalau karyawan dikasih akun `User`)?
9. **Jurnal akuntansi** — apakah proses bayar gaji perlu otomatis bikin jurnal Kas Keluar
   di modul Akuntansi/Keuangan (Internal) yang sudah ada, atau cukup dicatat di
   Administratif saja tanpa terhubung ke pembukuan?
10. **Multi-shift** — sistem lama cuma 1 jam kerja tunggal per tenant. Apakah dibutuhkan
    lebih dari 1 shift di sistem baru?

---

## 6. Langkah Selanjutnya

1. ~~Dapat source code aplikasi lama~~ ✅ selesai — riset di `~/Documents/Projects/ABSENSI/docs/`.
2. ~~Pelajari alur & business rule~~ ✅ selesai — dirangkum di dokumen ini.
3. **Bahas bagian 5 (Keputusan Bisnis)** dengan user — tiap poin menentukan bentuk schema
   & UI yang akan dibangun.
4. Desain schema Prisma (`AttendanceRecord`/`m_log` pengganti, `PayrollPeriod`,
   `PayrollComponent`, dst — nama final menyesuaikan hasil diskusi poin 3) mengikuti
   konvensi Modul Administratif yang sudah ada (`Employee`, `CorrespondenceLog`).
5. Implementasi halaman & API di `/administratif` (menyusul `karyawan/` dan `surat/`
   yang sudah ada).
