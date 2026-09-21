# Administratif — HRD: Absensi & Penggajian (Draft Spesifikasi)

**Status:** DRAFT — belum diimplementasi. Ditulis sebagai baseline proses sebelum source code
aplikasi lama (Android + CodeIgniter 3) dipelajari. Setiap asumsi di bawah yang ternyata beda
dari aplikasi lama **harus disesuaikan** begitu source code-nya direview — lihat daftar
"Yang Perlu Dikonfirmasi dari Aplikasi Lama" di tiap bagian.

**Cakupan:** beda dari `01`–`06` (spek modul Marketing/Simple Lead) dan `monitoring-server.md`
(as-built Monitoring). Dokumen ini untuk 2 proses baru di **Modul Administratif**
(`/administratif`, lihat [current-user.ts](../src/lib/current-user.ts)): **Absensi** dan
**Penggajian**. Fondasi yang sudah ada: model `Employee` (data karyawan) dan
`CorrespondenceLog` (surat-menyurat) di `prisma/schema.prisma` — lihat komentar
"Modul Administratif" di sana.

---

## 0. Konteks: Aplikasi Lama

Perusahaan sudah punya aplikasi HRD berjalan (Android + CodeIgniter 3) yang menangani
absensi & penggajian. Tujuan modul baru ini **bukan mendesain ulang dari nol**, tapi
mereplikasi alur yang sudah terbukti jalan, dipindahkan ke stack Next.js + Prisma yang
sama dengan modul Administratif lain. Draft di bawah dipakai sebagai kerangka awal
supaya diskusi lebih terarah begitu source code lama sudah bisa dipelajari — bukan
keputusan final.

Hal-hal yang paling penting dikonfirmasi dari source code lama:
- Skema database CI3 (nama tabel & kolom) untuk absensi, shift, komponen gaji, potongan.
- Endpoint API yang dipanggil app Android (format request/response check-in/out).
- Aturan bisnis yang di-hardcode di controller/model CI3 (rumus lembur, potongan telat, dst).
- Role/permission yang ada di app lama (siapa yang approve apa).

---

## 1. Proses Absensi

### 1.1 Aktor
- **Karyawan** — melakukan check-in/check-out lewat aplikasi Android.
- **Admin/HRD** — memantau rekap, approve izin/cuti, koreksi manual kalau ada kendala
  (GPS gagal, HP rusak, lupa absen, dll).
- **Atasan langsung** (kalau ada hierarki approval) — approve pengajuan izin/cuti bawahannya.

### 1.2 Alur Umum (asumsi awal, perlu dikonfirmasi)
1. Karyawan buka app Android, tekan **Check-in** — kemungkinan besar app lama merekam
   lokasi GPS dan/atau foto selfie untuk validasi kehadiran (pola umum app absensi
   mobile). Perlu dikonfirmasi apakah ada radius/geofence kantor yang divalidasi.
2. Sepanjang hari kerja, tidak ada aksi lain kecuali izin keluar (kalau app mendukung).
3. Di akhir shift, karyawan tekan **Check-out** — sistem hitung durasi kerja hari itu.
4. Kalau karyawan tidak absen (lupa / device bermasalah), status hari itu perlu
   ditandai manual oleh Admin/HRD (mis. "Alpha" sampai dikoreksi, atau "Izin" kalau ada
   pengajuan).
5. Pengajuan **Izin/Cuti/Sakit** — kemungkinan diajukan lewat app (dengan lampiran
   surat dokter untuk sakit) dan di-approve oleh atasan/HRD sebelum tanggalnya, atau
   submit di hari-H untuk kasus darurat/sakit mendadak.
6. Rekap kehadiran per periode (biasanya bulanan, mengikuti siklus gajian) jadi input
   ke proses Penggajian di bagian 2.

### 1.3 Status Kehadiran (asumsi, perlu dikonfirmasi daftar lengkapnya)
- Hadir (tepat waktu)
- Hadir (terlambat) — kemungkinan ada ambang toleransi keterlambatan dalam menit
- Izin
- Sakit
- Cuti
- Alpha (tidak hadir tanpa keterangan)
- Libur/Cuti Bersama

### 1.4 Data yang Kemungkinan Dibutuhkan
- `employeeId`, tanggal, jam check-in, jam check-out
- Lokasi (lat/long) check-in & check-out, kalau app lama pakai validasi GPS
- Foto bukti (kalau ada)
- Status hari itu (lihat 1.3)
- Shift kerja karyawan hari itu (kalau ada lebih dari 1 shift)
- Catatan/keterangan (khusus izin/sakit/cuti — termasuk lampiran)
- Siapa yang approve (untuk izin/cuti) & kapan

### 1.5 Yang Perlu Dikonfirmasi dari Aplikasi Lama
- [ ] Apakah check-in/out pakai validasi GPS/geofence? Radius berapa meter?
- [ ] Apakah wajib foto selfie saat absen?
- [ ] Berapa toleransi keterlambatan sebelum dianggap "terlambat"?
- [ ] Apakah ada multi-shift (shift pagi/siang/malam)? Bagaimana penjadwalannya?
- [ ] Alur approval izin/cuti — siapa approver-nya, berjenjang atau langsung ke HRD?
- [ ] Berapa jatah cuti tahunan per karyawan, dan bagaimana carry-over-nya?
- [ ] Bagaimana kasus lupa absen ditangani — self-service koreksi atau harus lapor HRD?
- [ ] Format data yang disimpan di DB CI3 (nama tabel/kolom) untuk dipetakan ke model baru.

---

## 2. Proses Penggajian

### 2.1 Aktor
- **HRD/Finance** — menghitung & memproses gaji tiap periode, approve sebelum dibayar.
- **Owner/Direktur** — approval akhir/otorisasi pembayaran (perlu dikonfirmasi levelnya).
- **Karyawan** — menerima slip gaji, kemungkinan lewat app Android.

### 2.2 Alur Umum (asumsi awal, perlu dikonfirmasi)
1. Tutup periode absensi (biasanya akhir bulan atau tanggal cut-off tertentu, mis.
   tanggal 25 s.d. 25 bulan berikutnya — perlu dikonfirmasi siklusnya).
2. Sistem tarik rekap kehadiran periode itu per karyawan (dari bagian 1) — jumlah hari
   hadir, terlambat, alpha, izin, lembur.
3. Hitung komponen gaji:
   - **Pendapatan:** gaji pokok, tunjangan (transport, makan, jabatan, dst — perlu
     daftar lengkap), lembur (kalau ada rumus per jam).
   - **Potongan:** potongan absensi (telat/alpha), BPJS Kesehatan & Ketenagakerjaan,
     PPh21 (kalau perusahaan menanggung/memotong pajak karyawan), **Kasbon** (model
     `Kasbon` sudah ada di schema — dipakai staf yang punya akun login `User`; perlu
     dikonfirmasi apakah semua karyawan HRD juga punya `User` atau ada karyawan yang
     cuma tercatat di `Employee` tanpa login sistem).
4. HRD review hasil hitung, koreksi manual kalau perlu, lalu **approve**.
5. Generate **slip gaji** per karyawan (kemungkinan bisa dilihat di app Android).
6. Proses pembayaran — kemungkinan transfer bank massal, dicatat sebagai pengeluaran
   di pembukuan (perlu dikonfirmasi apakah harus terhubung ke modul Akuntansi/Keuangan
   yang sudah ada di Internal, sebagai jurnal Kas Keluar kategori "Gaji").
7. Arsip slip gaji per periode per karyawan untuk riwayat.

### 2.3 Data yang Kemungkinan Dibutuhkan
- Periode penggajian (mis. "2026-09"), tanggal cut-off, tanggal bayar
- Per karyawan: gaji pokok, daftar tunjangan (nominal/formula), daftar potongan
- Ringkasan absensi periode itu (dari bagian 1) sebagai dasar potongan/lembur
- Status slip: draft → direview → approved → dibayar
- Referensi pembayaran (nomor transfer/batch, tanggal bayar)

### 2.4 Yang Perlu Dikonfirmasi dari Aplikasi Lama
- [ ] Siklus penggajian: tanggal cut-off & tanggal bayar.
- [ ] Daftar lengkap komponen tunjangan & potongan yang ada, beserta formulanya.
- [ ] Rumus lembur (per jam? berjenjang? beda untuk hari libur?).
- [ ] Rumus potongan keterlambatan/alpha (potong per hari? per jam? flat?).
- [ ] Apakah PPh21 dihitung otomatis di sistem lama, dan pakai metode apa (gross/gross-up/net)?
- [ ] Persentase BPJS Kesehatan & Ketenagakerjaan yang dipakai, dan siapa yang menanggung
      porsi berapa (karyawan vs perusahaan).
- [ ] Apakah ada approval berjenjang sebelum gaji dibayar, atau cukup 1 approver?
- [ ] Bagaimana slip gaji ditampilkan/didistribusikan ke karyawan di app lama?
- [ ] Apakah potongan Kasbon otomatis dipotong dari gaji per periode, atau manual?
- [ ] Apakah proses gaji perlu terhubung ke modul Akuntansi (jurnal otomatis) seperti alur
      Transaction/Kas Keluar yang sudah ada, atau cukup dicatat di modul Administratif saja?

---

## 3. Langkah Selanjutnya

1. User akan membagikan source code Android + CodeIgniter 3 aplikasi lama.
2. Pelajari skema DB, endpoint API, dan business rule yang sudah di-hardcode di sana.
3. Update dokumen ini jadi versi final (hapus tanda DRAFT, hapus checklist "Perlu
   Dikonfirmasi" yang sudah terjawab, sesuaikan alur & data model sesuai temuan).
4. Baru setelah itu desain schema Prisma (`AttendanceRecord`, `PayrollPeriod`,
   `PayrollItem`, dst — nama final menyesuaikan hasil review) dan implementasi halaman
   di `/administratif`.
