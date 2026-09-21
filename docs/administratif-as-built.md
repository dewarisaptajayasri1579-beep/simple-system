# Modul Administratif — As-Built

**Cakupan:** Dokumentasi as-built untuk **Modul Administratif** (`/administratif`) —
menjelaskan apa yang sudah dibangun, di file mana, dan cara meluaskannya kalau perlu.
Beda dari [`administratif-hrd-absensi-penggajian.md`](administratif-hrd-absensi-penggajian.md)
(dokumen rencana: alur sistem lama yang dipelajari + keputusan bisnis final SEBELUM
implementasi) — dokumen ini ditulis SETELAH kode jadi, jadi sumber kebenaran untuk apa
yang benar-benar berjalan.

Akses modul ini dikontrol lewat `User.modules` — user harus punya `"administratif"` di
array itu, atau role `owner` (owner selalu bypass). Lihat `getCurrentUser("administratif")`
di [current-user.ts](../src/lib/current-user.ts), dipakai
[`(shell)/layout.tsx`](../src/app/administratif/(shell)/layout.tsx). Nav-nya sendiri
(bukan reuse Sidebar Internal) ada di
[`AdministratifShell.tsx`](../src/components/administratif/AdministratifShell.tsx): Beranda,
Data Karyawan, Absensi, Penggajian, Kasbon, Surat Menyurat.

---

## 1. Data Karyawan

- **Halaman:** [`karyawan/page.tsx`](../src/app/administratif/(shell)/karyawan/page.tsx)
- **API:** [`api/administratif/karyawan/route.ts`](../src/app/api/administratif/karyawan/route.ts) (GET list, POST create), `[id]/route.ts` (PATCH, DELETE)
- **Model:** `Employee` (`prisma/schema.prisma`) — data dasar (nama, jabatan, status,
  tanggal masuk, kontak), kredensial login Android (`username`/`passwordHash`, **terpisah
  total** dari `User`/`Session` web), dan komponen gaji master (`basicSalary`,
  `positionAllowance`, `dailyAttendanceAllowance`, `dailyTransportAllowance`,
  `bpjsKesehatanDeduction`, `bpjsKetenagakerjaanDeduction`) dipakai mesin hitung Penggajian.
- **Keamanan:** `passwordHash` TIDAK PERNAH ikut di-`select` ke response API — pakai
  konstanta `EMPLOYEE_SELECT` di [`lib/hrd/employee-select.ts`](../src/lib/hrd/employee-select.ts)
  di SEMUA query Employee yang hasilnya balik ke client. Kalau nambah kolom sensitif baru
  ke `Employee`, jangan lupa TIDAK ditambahkan ke select ini.

## 2. Absensi

- **Halaman:** [`absensi/page.tsx`](../src/app/administratif/(shell)/absensi/page.tsx) (rekap +
  koreksi manual + pengajuan izin, 2 tab), [`absensi/pengaturan/page.tsx`](../src/app/administratif/(shell)/absensi/pengaturan/page.tsx) (jam kerja, geofence, jenis izin, libur nasional).
- **API web admin:** `api/administratif/absensi/route.ts` (GET rekap, POST koreksi manual),
  `pengaturan-hrd/route.ts` (GET/PATCH `HrSettings`), `jenis-izin/*`, `libur-nasional/*`,
  `pengajuan-izin/*`.
- **API Android** (`src/app/api/mobile/hrd/`): `login`, `info`, `absen-masuk`,
  `absen-pulang`, `log-activity`. Auth token via header `Authorization: Bearer <token>`
  (BUKAN cookie session) — helper `getEmployeeFromToken()` di
  [`lib/hrd/auth.ts`](../src/lib/hrd/auth.ts), token disimpan di model `EmployeeSession`
  (dibuat saat login, `expiresAt` 30 hari, dicek manual per-route — tidak ada `middleware.ts`
  di project ini).
- **Model:** `AttendanceRecord` (1 baris/hari/karyawan, `@@unique([employeeId, date])`,
  status `O`/`I`/`C`), `LeaveType`, `LeaveRequest` (**tanpa approval** — begitu HR input,
  langsung dianggap sah, keputusan bisnis final), `NationalHoliday`, `HrSettings`
  (singleton `id="singleton"`: jam masuk/pulang, radius geofence + koordinat kantor,
  tanggal cutoff payroll, pembagi lembur, premi kehadiran).
- **Geofence:** diaktifkan (beda dari sistem lama yang datanya ada tapi tidak ditegakkan) —
  validasi jarak haversine di [`lib/hrd/geo.ts`](../src/lib/hrd/geo.ts)
  (`distanceMeters()`), dicek di `absen-masuk/route.ts` terhadap `HrSettings.kantorLat/Lng`.
  Kalau koordinat kantor belum diisi di Pengaturan, validasi di-skip (tidak block absen).
- **Foto absen:** wajib, diupload ke Supabase Storage lewat
  `uploadToSupabaseStorage()` ([`lib/supabase-storage.ts`](../src/lib/supabase-storage.ts)),
  path `hrd-absensi/{employeeId}/{tanggal}-{masuk|pulang}-{timestamp}.jpg`.
- **Jam kerja:** SATU sumber kebenaran (`HrSettings.jamMasuk`/`jamPulang`), dipakai
  konsisten untuk cek telat — sengaja diperbaiki dari bug sistem lama (dua nilai jam
  kerja berbeda dipakai di dua tempat, lihat docs alur lama §1.5).

## 3. Penggajian

- **Halaman:** [`penggajian/page.tsx`](../src/app/administratif/(shell)/penggajian/page.tsx)
  (list periode), [`penggajian/[id]/page.tsx`](../src/app/administratif/(shell)/penggajian/[id]/page.tsx)
  → [`PenggajianDetailClient.tsx`](../src/components/administratif/PenggajianDetailClient.tsx)
  (detail per karyawan, edit komponen manual, tombol Bayar Gaji).
- **API:** `api/administratif/penggajian/route.ts` (GET list, POST hitung/hitung-ulang),
  `[id]/route.ts` (GET detail), `[id]/item/[itemId]/route.ts` (PATCH komponen manual),
  `[id]/bayar/route.ts` (POST — **owner-only**, aksi finansial).
- **Mesin hitung:** [`lib/hrd/payroll.ts`](../src/lib/hrd/payroll.ts) —
  `resolvePeriodRange()` (periode dari `HrSettings.tglCutoff`), `countEffectiveDays()`
  (Senin–Jumat, exclude `NationalHoliday`), `computePayrollItem()` (formula per karyawan).
- **Model:** `PayrollPeriod` (1 baris/periode `"YYYY-MM"`, status `draft`→`posted`,
  `transactionId` link presisi ke `Transaction` pembayarannya), `PayrollItem` (1
  baris/karyawan/periode, field ber-komentar "editable HR" boleh diubah manual sebelum
  `posted`).
- **Formula** (simplifikasi v1 dari sistem lama, lihat
  [administratif-hrd-absensi-penggajian.md §5](administratif-hrd-absensi-penggajian.md#5-keputusan-bisnis-untuk-sistem-baru-final)):
  ```
  daysPresent   = jumlah AttendanceRecord periode ini yang ada checkInAt
  overtimeMinutes = SUM(max(0, workDurationMinutes - 540)) per hari  // 540 = 9 jam
  daysLeave     = jumlah LeaveRequest periode ini
  daysAbsent    = effectiveDays - daysPresent - daysLeave

  basicSalary(prorata) = Employee.basicSalary × (daysPresent / effectiveDays)
  attendanceAllowance  = Employee.dailyAttendanceAllowance × daysPresent
  transportAllowance   = Employee.dailyTransportAllowance × daysPresent
  overtimePay          = (Employee.basicSalary / HrSettings.nominalLembur) × (overtimeMinutes/60)
  attendanceBonus      = daysAbsent==0 && !ada yang telat ? HrSettings.premiKehadiran : 0

  grossPay        = basicSalary(prorata) + positionAllowance + attendanceAllowance
                   + transportAllowance + overtimePay + attendanceBonus + otherEarnings
  totalDeduction  = bpjsKesehatan + bpjsKetenagakerjaan + kasbonDeduction + otherDeductions
  netPay          = grossPay - totalDeduction   // BOLEH NEGATIF (keputusan final)
  ```
  `otherEarnings`/`bpjsKesehatan`/`bpjsKetenagakerjaan`/`kasbonDeduction`/`otherDeductions`
  default `0` saat pertama dihitung — HR isi manual lewat modal edit di halaman detail
  SEBELUM tekan "Bayar Gaji" (sesudah `posted`, `PATCH item` ditolak).
- **PPh21:** TIDAK dihitung sama sekali di v1 (keputusan final, sama seperti tenant sistem
  lama yang `persenpph=0`).

## 4. Kasbon Karyawan

- **Halaman:** [`kasbon/page.tsx`](../src/app/administratif/(shell)/kasbon/page.tsx)
- **API:** `api/administratif/kasbon/route.ts` (GET list, POST cairkan — Owner/Direktur),
  `[id]/route.ts` (PATCH toggle status `outstanding`/`lunas` — manual, TIDAK dihitung
  otomatis dari potongan gaji di v1).
- **Model:** `EmployeeKasbon` — mirror `Kasbon` (User) yang sudah ada di modul Internal,
  tapi terhubung ke `Employee` bukan `User` (karena Employee tidak punya akun web).
- **Integrasi akuntansi:** pencairan bikin 1 `Transaction` (`type:"expense"`,
  `refType:"employee_kasbon"`) + jurnal draft debit **Piutang Karyawan** (`1-2500`, akun
  yang SAMA dipakai `Kasbon` biasa)/kredit Kas-Bank — reuse `kasbonDisbursementLines()` di
  [`journal-rules.ts`](../src/lib/accounting/journal-rules.ts) apa adanya.
- **Hubungan ke Penggajian:** potongan Kasbon per periode gaji diisi MANUAL oleh HR
  (field `PayrollItem.kasbonDeduction`) berdasarkan yang dia lihat di halaman ini — TIDAK
  ada linking otomatis per-`EmployeeKasbon` row. Begitu "Bayar Gaji" diproses, total
  `kasbonDeduction` seluruh karyawan periode itu ikut kredit ke akun Piutang Karyawan yang
  sama (lihat §5), tapi status `EmployeeKasbon` individual tetap harus ditandai "Lunas"
  manual di halaman ini.

## 5. Integrasi Jurnal Akuntansi (Kas Keluar)

- **Fungsi:** `markPayrollPaid()` di [`lib/accounting/mark-paid.ts`](../src/lib/accounting/mark-paid.ts)
  — dipanggil dari `POST /api/administratif/penggajian/[id]/bayar` di dalam
  `prisma.$transaction`. Reuse pola `markServerPaid` (1 entitas = 1 Transaction + 1
  jurnal), bedanya "entitas"-nya di sini `PayrollPeriod` (gabungan SEMUA karyawan periode
  itu), bukan per-karyawan.
- **Akun COA baru:** `6-7000 Beban Gaji` (`COA_CODE.bebanGaji` di
  [`coa-seed.ts`](../src/lib/accounting/coa-seed.ts)) — sudah di-seed ke database produksi
  (`npx tsx scripts/seed-coa.ts`, idempotent, aman dijalankan ulang).
- **Jurnal** (`payrollPaidLines()` di `journal-rules.ts`):
  ```
  Debit  Beban Gaji (6-7000)     = totalGrossPay − totalBpjs/OtherDeduction
  Kredit Kas/Bank                = totalNetPay (kas yang benar-benar ditransfer)
  Kredit Piutang Karyawan (1-2500) = totalKasbonDeduction (kalau ada, melunasi sebagian Kasbon)
  ```
  Balance: Debit = Kredit selalu (lihat komentar fungsi untuk pembuktian aljabar-nya).
- **Draft → Posted:** `markPayrollPaid` cuma bikin Transaction+jurnal **draft** dan
  langsung mengunci `PayrollPeriod.status="posted"` (tidak bisa dihitung ulang lagi) —
  TIDAK auto-post. Owner/Finance posting manual lewat `POST /api/transactions/[id]/post`
  yang sudah ada (halaman Keuangan → Transaksi), sama seperti alur "Bayar Server"/"Bayar
  Domain". Kalau Transaction draft ini di-void sebelum diposting, `PayrollPeriod` TETAP
  berstatus "posted" (tidak ada rollback otomatis) — kasus ini belum ditangani di v1,
  perlu perbaikan manual di database kalau terjadi.

---

## 6. Yang Sengaja Belum Dibangun (v1)

Simplifikasi eksplisit vs sistem lama — lihat alasan lengkap di
[administratif-hrd-absensi-penggajian.md §5](administratif-hrd-absensi-penggajian.md):

- **Approval izin/cuti** — tidak ada gate approval, HR input = langsung sah.
- **Self-service karyawan** — Employee tidak punya akun web, tidak bisa lihat slip gaji
  sendiri; hanya app Android (belum diintegrasikan, lihat §7) untuk absen.
- **PPh21** — tidak dihitung sama sekali.
- **Multi-shift** — satu jam kerja untuk semua karyawan.
- **Slip gaji PDF** — belum ada halaman cetak/export, cuma tabel di UI.
- **Auto-lunas Kasbon dari potongan gaji** — status kasbon ditandai manual.
- **Rollback `PayrollPeriod` kalau Transaction-nya di-void** — belum ditangani.

## 7. Yang Belum Dikerjakan Sama Sekali

- **Integrasi app Android Flutter** yang sudah ada (`~/Documents/Projects/ABSENSI/ANDROID`)
  ke API `/api/mobile/hrd/*` di atas — API-nya sudah siap dipakai, tapi app Flutter-nya
  sendiri belum diubah untuk hit endpoint baru ini (masih hit backend CodeIgniter 3 lama).
