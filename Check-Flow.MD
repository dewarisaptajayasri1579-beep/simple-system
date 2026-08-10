# Check-Flow — Domain

Alur nyata (dari kode, bukan asumsi) untuk 1 Domain: dari input master data sampai kehitung di
COA. Domain punya **2 jalur berbeda** tergantung `clientId`-nya diisi atau tidak — keduanya
dijelaskan di bawah.

> **Cash-basis** (lihat `pedoman_akunting.md` untuk aturan jurnal lengkap): Invoice TIDAK PERNAH
> bikin jurnal apa pun. Pendapatan (ke akun **Pendapatan Domain**, 4-4000, khusus — bukan
> "Pendapatan Jasa" umum), PPN, dan HPP semuanya baru diakui SEKALIGUS saat Payment-nya
> diposting.

## Diagram

```mermaid
flowchart TD
  A["1. Kelola di Master Data\nPengaturan > Master Data > Domain\nPATCH /api/domains/:id (edit saja, TIDAK ada create lewat UI)"] --> B{clientId diisi?}

  B -- "Ya, milik Client" --> C["2. Muncul di Dashboard\nDomain — Lewat / Bulan Ini / Bulan Depan\nsyarat: active=true DAN\nbucket = expired/bulan ini/bulan depan\n(dari expiryDate / \"Tgl Berakhir\")"]
  C --> D["3. Tagih Sekarang\nlink ke /penjualan/baru\nprefill clientId + amount + domainId"]
  D --> E["4. Invoice dibuat (Draft)\nPOST /api/invoices\nTIDAK ADA JURNAL SAMA SEKALI\ncostLinkType=domain, costLinkId=domain ini"]
  E --> F["5. Posting Invoice\nPOST /api/invoices/:id/post\npostStatus -> posted (cuma flip status)"]
  F --> G["6. Input Pembayaran\n/pembayaran?invoiceId=...\nPOST /api/payments\ncostMode+costLinkId AUTO terisi dari Invoice.costLinkType/Id"]
  G --> G2{"Biaya ke Domain\nkepilih? (auto kalau dari\nTagih Sekarang, manual\nkalau invoice dibuat lain)"}
  G2 -- "Ya (costLink)" --> G3["markDomainPaid()\nTransaction expense terpisah (BKK/...)\n+ jurnal Beban Domain (Draft)"]
  G2 -- "Tidak" --> H
  G3 --> H["7. Posting Payment\nPOST /api/payments/:id/post\nDI SINI Pendapatan Domain+PPN+HPP\nbaru dijurnal (invoicePaymentLines)"]
  H --> I["8. Efek setelah posted:\n- Invoice.status: unpaid/partial/paid\n- Domain.lastPaidAt terupdate + expiryDate +1 tahun\n  dari expiryDate sebelumnya\n  (CUMA kalau ada costLink di langkah 6)"]
  I --> J["9. COA / Buku Besar / Laporan\nJurnal postStatus=posted dihitung:\nKas & Bank, Pendapatan Domain, PPN Keluaran,\nBeban Domain (kalau ada costLink), HPP"]

  B -- "Tidak, Internal (7Smarts sendiri)" --> K["2b. Muncul di Dashboard\nkolom Aksi: tombol 'Bayar Sekarang'\n(bukan Tagih Sekarang)"]
  K --> L["3b. Bayar Sekarang\n-> /keuangan/kas-keluar?domainId=...\nbaris 'Bayar Domain' + domain SUDAH terisi\n(atau input manual, pilih Tipe 'Bayar Domain' sendiri)"]
  L --> M["4b. Simpan -> POST /api/transactions/kas-keluar\n-> markDomainPaid()\nTransaction expense (Draft, nomor bukti BKK/tahun/urut)\n+ jurnal Beban Domain (Draft)\nTIDAK lewat Invoice/Payment sama sekali"]
  M --> N["5b. Kalau cuma 1 baris disimpan,\nlangsung dibawa ke /keuangan/transaksi/:id\nPosting/Hapus/Lihat Jurnal/Batalkan ada di situ"]
  N --> O["6b. Efek setelah posted:\nDomain.lastPaidAt terupdate + expiryDate +1 tahun\n(dari expiryDate LAMA, bukan tanggal bayar)\nBeban Domain masuk COA"]
```

## Penjelasan tiap langkah

### 1. Kelola di Master Data
- **Di mana:** Pengaturan → Master Data → tab Domain (`MasterDataPanel.tsx`).
- **API:** `src/app/api/domains/route.ts` cuma punya `GET` (list) — **tidak ada `POST`, jadi domain baru TIDAK BISA ditambah lewat UI ini.** Baris Domain hanya berasal dari migrasi data lama (`legacyId`); yang bisa dilakukan staf di Master Data cuma **edit** baris yang sudah ada, lewat `PATCH /api/domains/[id]` (`src/app/api/domains/[id]/route.ts`).
- **Field kunci yang bisa diedit:** `name`, `clientId` (kosong = Internal/7Smarts), `sellPrice` (harga jual ke client), `lastPaidAt` (kapan terakhir dibayar), `expiryDate`/"Tgl Berakhir" (kapan servicenya berakhir — acuan renewal), `active` (plus `cpanelAccountId`, tidak relevan ke alur ini).
- `lastPaidAt` dan `expiryDate` **dua field terpisah dengan arti beda**. `resolveDomainExpiry(domain)` (`src/lib/domain-status.ts`) = `expiryDate` kalau ada, fallback `lastPaidAt + 1 tahun` cuma buat baris yang belum pernah kesetel `expiryDate`-nya — bisa dikoreksi manual lewat kolom "Tgl Berakhir" (klik untuk edit, `src/components/shared/EditableDateCell.tsx`, dipakai bareng dengan Server).

### 2. Muncul di Dashboard
- **Di mana:** `DomainExpiringSection` (`src/components/dashboard/DashboardSections.tsx`), data dari `src/app/dashboard/page.tsx`.
- **Syarat tampil:** `active = true` DAN bucket-nya `expired` / `expiring_this_month` / `expiring_next_month` (domain yang masih "aman" tidak ditampilkan di section ini).
- Kolom **Pemilik** menampilkan nama client + PIC + No. WA + tombol follow-up WA (kalau ada `clientId`); kalau Internal cuma tampil "Internal".
- Kolom **Aksi** beda tergantung `clientId`:
  - Ada client → tombol **"Tagih Sekarang"**.
  - Internal → tombol **"Bayar Sekarang"** (cuma tampil untuk Owner; staf lain cuma lihat teks "Internal") — link ke `/keuangan/kas-keluar?domainId=...`, BUKAN modal "Tandai Lunas" langsung (itu cara lama, lihat catatan di bagian Jalur Internal).

### 3. Jadi Tagihan (jalur Client)
- Klik "Tagih Sekarang" → `/penjualan/baru?clientId=...&description=Perpanjangan domain ...&amount=...&domainId=...`.
- Submit form → `POST /api/invoices` → bikin `Invoice` (default `postStatus: "draft"`, `status: "unpaid"`) + `InvoiceLine`, DAN kalau `domainId`/`serverId` dikirim, `Invoice.costLinkType`/`costLinkId` ikut kesimpan — invoice ini "ingat" domain/server mana yang dimaksud (lihat langkah 6).
- **TIDAK ADA jurnal dibuat di titik ini** — bukan cuma Piutang/Pendapatan, HPP juga tidak (beda dari versi lama dokumen ini). Detail lengkap kenapa: `pedoman_akunting.md`.

### 4. Posting Invoice
- **Di mana:** halaman `/penjualan/[id]`, tombol **"Posting Invoice"** (`InvoicePostButton`) — cuma muncul kalau `postStatus = draft`.
- **API:** `POST /api/invoices/:id/post` → `postStatus: draft → posted`. Tidak ada jurnal yang difinalkan (tidak ada yang dibuat di langkah 3).
- **Penting:** selama masih draft, invoice ini **tidak muncul** di daftar pilihan invoice pada form Pembayaran (`PembayaranForm` cuma fetch `?postStatus=posted`) — jadi wajib diposting dulu sebelum bisa dibayar.

### 5-6. Pembayaran (Pelunasan) & Posting Payment — di sinilah semua jurnal Domain terjadi
- **Di mana:** `/pembayaran?clientId=...&invoiceId=...` (`PembayaranForm.tsx`), lalu diposting dari `/pembayaran/[id]`.
- **Kaitkan biaya ke Domain:** di form Pembayaran ada pilihan "Biaya" per baris yang bisa diarahkan ke `costMode: "domain"` + pilih domain-nya (`costLinkId`). Kalau dipakai, `markDomainPaid()` otomatis jalan bareng: bikin `Transaction` (expense, draft, nomor bukti BKK) + jurnal Beban Domain terpisah, tetap 1 `paymentId` yang sama.
- **Otomatis terisi kalau invoice-nya dari "Tagih Sekarang":** `PembayaranForm` baca `Invoice.costLinkType`/`costLinkId` — kalau ada, baris pembayaran itu langsung di-preset `costMode`+`costLinkId`-nya, staf cuma perlu isi nominal HPP-nya. Kalau invoice dibuat manual, staf harus pilih sendiri.
- **`POST /api/payments/:id/post`** → semua `Transaction` dengan `paymentId` yang sama di-posting sekaligus (atomik). DI SINI (bukan sebelumnya) jurnal Pendapatan Domain + PPN + HPP proporsional baru dibuat lewat `invoicePaymentLines` — lihat `pedoman_akunting.md` §3 untuk rumusnya.
- Efek lain setelah posted: `Invoice.status` dihitung ulang (`unpaid → partial/paid`); kalau ada cost-link Domain, `Domain.lastPaidAt` diupdate ke tanggal bayar, DAN `Domain.expiryDate` ditambah 1 tahun dari `expiryDate` **sebelumnya** (bukan dari tanggal bayar) — supaya telat bayar tidak menggeser siklus jatuh tempo tahun depan (`finalizeTransactionPosting`, `src/lib/accounting/mark-paid.ts`).
- **Kalau tidak ada cost-link sama sekali**, pembayaran invoice tetap sukses, tapi `Domain.lastPaidAt`/`expiryDate` **tidak ikut ter-update** — itu bukan bug, memang harus eksplisit dikaitkan.

### 7. COA / Buku Besar / Laporan
- Semua laporan (`/akuntansi/coa`, `/akuntansi/buku-besar`, Neraca Akrual, Laba Rugi Akrual) cuma menghitung `JournalLine` yang jurnalnya `postStatus = "posted"` — draft dan voided dikecualikan.
- Akun yang kena untuk 1 siklus Domain (jalur Client, lengkap dengan cost-link), semua dijurnal SEKALIGUS saat Payment diposting:
  - **Kas & Bank** — debit (dari pembayaran invoice), kredit (dari HPP & Beban Domain kalau kas keluarnya dari akun yang sama).
  - **Pendapatan Domain** (4-4000, BUKAN "Pendapatan Jasa") — kredit, sebesar (jumlah dibayar − porsi PPN).
  - **PPN Keluaran** — kredit, kalau invoice-nya pakai PPN.
  - **HPP** — debit, HANYA kalau invoice-nya diisi HPP per baris saat dibuat (proporsional terhadap porsi yang dibayar).
  - **Beban Domain** — debit, HANYA kalau ada cost-link ke domain ini (baris "Biaya" di Pelunasan, atau "Bayar Sekarang"/Kas Keluar jalur Internal) — ini TERPISAH dari HPP invoice di atas, dua hal beda.

### Jalur Internal (tanpa Client)
Domain internal (7Smarts sendiri) **tidak pernah masuk Invoice/Piutang/Payment sama sekali** —
langsung dicatat sebagai pengeluaran:
- **Tombol cepat:** "Bayar Sekarang" di Dashboard (Owner-only) → navigasi ke `/keuangan/kas-keluar?domainId=...` dengan baris "Bayar Domain" sudah keisi, staf tinggal cek nominal/akun kas lalu Simpan.
- **Atau:** Keuangan → Kas Keluar → tambah baris manual, pilih Tipe "Bayar Domain" sendiri.
- Submit → `POST /api/transactions/kas-keluar` → manggil `markDomainPaid()` (satu fungsi, dipakai juga oleh jalur cost-link di Pembayaran) → `Transaction` expense (draft, nomor bukti `BKK/{tahun}/{urut}`) + jurnal Beban Domain (draft).
- **Kalau cuma 1 baris yang disimpan**, setelah Simpan langsung dibawa ke halaman detail transaksi (`/keuangan/transaksi/[id]`) — di situ ada tombol **Posting**, **Hapus** (selama masih draft), **Lihat Jurnal**, dan **Batalkan** (setelah posted, Owner-only).
- Setelah diposting (`POST /api/transactions/:id/post`) → `Domain.lastPaidAt` ke-update ke tanggal bayar, `Domain.expiryDate` maju 1 tahun dari `expiryDate` sebelumnya (bukan dari tanggal bayar), + Beban Domain masuk COA.
- **Catatan:** ada juga endpoint `POST /api/domains/:id/mark-paid` (dan komponen `MarkPaidButton.tsx`) dari desain lama yang masih berfungsi identik (juga manggil `markDomainPaid()`), tapi **sudah tidak dipanggil dari UI manapun** — Dashboard sekarang selalu lewat Kas Keluar. Aman dibiarkan (tidak error kalau ada yang panggil langsung), tapi kalau mau bersih-bersih kode, ini kandidat dihapus.

## Yang perlu diwaspadai (bukan bug, tapi gampang salah paham)
1. **"Tagih Sekarang" otomatis mengaitkan Domain ke invoice-nya** (lewat `Invoice.costLinkType`/`costLinkId`), jadi form Pembayaran akan auto-preset cost-link-nya. TAPI invoice yang dibuat dengan cara lain (bukan lewat tombol "Tagih Sekarang") tidak punya link ini — staf tetap wajib pilih manual di form Pembayaran, kalau tidak `expiryDate` domain tetap tanggal lama walau invoice-nya sudah lunas.
2. Invoice & Payment **draft tidak kehitung di mana pun** (Dashboard, COA, Buku Besar, saldo Kas) sampai eksplisit diposting — dua langkah posting terpisah (Invoice, lalu Payment) wajib dilakukan berurutan.
3. **Pendapatan Domain baru diakui saat Payment diposting**, bukan saat invoice dibuat/diposting — beda dari dokumen versi lama yang bilang "diakui saat invoice terbit". Lihat `pedoman_akunting.md` untuk penjelasan lengkap migrasi cash-basis ini.
4. HPP domain bisa "diakui" di 2 titik yang beda maknanya: **HPP invoice** (`unitCost` baris Invoice, sekarang juga baru dijurnal saat Payment diposting, proporsional) vs **Beban Domain** lewat cost-link/"Bayar Sekarang" (Transaction expense terpisah, akun beda) — biasanya cuma salah satu yang dipakai, bukan dua-duanya sekaligus untuk 1 domain yang sama.
5. **`lastPaidAt` dan `expiryDate` sengaja dipisah**: `lastPaidAt` = kapan terakhir dibayar (catatan historis), `expiryDate` = kapan servicenya benar-benar berakhir (acuan renewal). Status Lewat/Bulan Ini/Bulan Depan di Dashboard SELALU pakai `expiryDate`, bukan `lastPaidAt`.
6. Server sekarang punya field `expiryDate` yang sama persis polanya dengan Domain (dulu Domain-only) — lihat `Check-Flow-Server.MD`.
