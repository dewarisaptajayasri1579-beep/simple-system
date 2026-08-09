# Pedoman Akuntansi & Jurnal — simple-system

Dokumen ini adalah rujukan tunggal untuk semua hal terkait jurnal (double-entry) dan Chart of
Accounts (COA) di aplikasi ini. Kalau ada perubahan pada aturan pengakuan pendapatan/beban atau
struktur COA, dokumen ini WAJIB ikut diperbarui.

Sumber kebenaran bisnis: `aturan.txt` (root repo, user-maintained). Baris pertamanya adalah
prinsip inti seluruh sistem:

> **"Piutang hanya catatan, Pendapatan diakui setelah ada uang masuk."**

## 1. Prinsip dasar

- **Cash-basis penuh** untuk Pendapatan, PPN, dan HPP — ketiganya diakui BARENGAN, tepat saat
  uang benar-benar diterima (Payment diposting). Tidak ada pengakuan akrual di titik mana pun
  sebelum itu.
- **Piutang bukan akun GL** — tidak ada jurnal yang pernah menyentuh "1-2000 Piutang Usaha" untuk
  transaksi baru. Sisa piutang cukup dihitung sebagai field biasa: `Invoice.totalAmount − total
  InvoicePayment efektif` (lihat `src/app/api/payments/[id]/post/route.ts` untuk rumus
  `unpaid/partial/paid`). Akun "1-2000" masih ada di COA untuk kompatibilitas riwayat lama, tapi
  tidak dipakai jurnal baru manapun.
- **Invoice = pencatatan, bukan pengakuan.** Membuat/posting Invoice TIDAK PERNAH menghasilkan
  jurnal apa pun — bukan Piutang, bukan Pendapatan, bukan HPP. Invoice cuma menyimpan data
  (nominal, client, baris item) yang nanti dipakai sebagai acuan saat Payment-nya diproses.
- **Akun Pendapatan dipecah per sumber** (Domain/Server/Maintenance/Project/Jasa umum), di-resolve
  otomatis per invoice lewat `revenueCoaCodeForInvoice()` — lihat §3.

## 2. Titik-titik pengakuan jurnal per modul

| Modul | Kapan jurnal dibuat | Fungsi journal-rules | Sumber jurnal (`sourceType`) |
|---|---|---|---|
| **Invoice** (`POST /api/invoices`) | **TIDAK PERNAH** | — | — |
| **Payment** (`POST /api/payments`) | Saat baris pembayaran diinput (draft), efektif saat diposting | `invoicePaymentLines` | `invoice_payment` |
| **Domain/Server/Maintenance "Tandai Lunas"** (`mark-paid.ts`) | Saat dicatat (draft), efektif saat diposting | `billPaidLines` | `domain` / `server` / `maintenance` |
| **Biaya Berkala "Tandai Lunas"/Kas Keluar** | Saat dicatat (draft), efektif saat diposting | `billPaidLines` | `recurring_bill` |
| **Kas Masuk manual** (`POST /api/transactions`, type income) | Saat dicatat (draft), efektif saat diposting | `manualIncomeLines` | `transaction` |
| **Kas Keluar manual** (`POST /api/transactions`, `.../kas-keluar`) | Saat dicatat (draft), efektif saat diposting | `manualExpenseLines` | `transaction` |
| **AI Assistant — catat pemasukan/pengeluaran** (`agent-tools.ts` `recordIncome`/`recordExpense`) | **TIDAK PERNAH** — lihat §5 (gap yang diketahui) | — | — |
| **Project Termin** (`generateTerminInvoice`) | Invoice-nya sendiri tidak bikin jurnal (sama seperti Invoice biasa) — jurnal Pendapatan Project baru muncul saat Payment-nya diposting, lewat jalur `invoice_payment` yang sama | `invoicePaymentLines` | `invoice_payment` |

Semua jurnal dibuat dengan `postStatus: "draft"` di titik "dicatat", lalu difinalkan
(`postStatus: "posted"`) di titik "diposting" lewat `postJournalEntryFinal`/`finalizeJournalEntryById`
— draft TIDAK kehitung di laporan/saldo mana pun sampai diposting.

## 3. Detail: Payment → satu-satunya titik pengakuan Pendapatan+PPN+HPP

`POST /api/payments` (`src/app/api/payments/route.ts`), untuk tiap baris invoice yang dibayar:

```
ppnPortion    = round(invoice.ppnAmount * line.amount / invoice.totalAmount)
hppPortion    = round(invoice.totalCost * line.amount / invoice.totalAmount)
revenuePortion = line.amount − ppnPortion
```

Lalu `invoicePaymentLines()` (`src/lib/accounting/journal-rules.ts`) menghasilkan jurnal:

```
Debit  Kas/Bank                 line.amount
Credit Pendapatan[X]            revenuePortion   (X = revenueCoaCodeForInvoice(invoice))
Credit PPN Keluaran             ppnPortion        (kalau > 0)
Debit  HPP                      hppPortion        (kalau > 0)
Credit Kas/Bank                 hppPortion        (kalau > 0 — HPP dianggap dibayar langsung,
                                                    bukan dicatat sebagai utang vendor)
```

Balance: `amount + hppPortion == revenuePortion + ppnPortion + hppPortion` ✓ (karena
`revenuePortion + ppnPortion == amount`).

**`revenueCoaCodeForInvoice(invoice)`** (`src/lib/accounting/coa-seed.ts`) — resolve akun
Pendapatan yang tepat, prioritas:
1. `Invoice.revenueCoaCode` eksplisit (mis. Termin Project → `pendapatanProject`).
2. `Invoice.costLinkType` (`"domain"|"server"|"maintenance"`, keisi otomatis kalau invoice dibuat
   lewat "Tagih Sekarang") → akun kategori yang sesuai.
3. Fallback: `pendapatanJasa` (4-1000) — invoice manual yang tidak dikaitkan ke item spesifik.

**Biaya (HPP) manual yang dikaitkan ke Bayar Domain/Server/Maintenance saat Pelunasan**
(`line.costAmount` di form Pembayaran) itu **TERPISAH** dari `hppPortion` di atas — itu memicu
`markDomainPaid`/`markServerPaid`/`markMaintenancePaid` sendiri (Transaction + jurnal Beban
Domain/Server/Maintenance terpisah, `paymentId` sama). `hppPortion` di `invoicePaymentLines`
murni dari `unitCost` baris Invoice yang diisi staf saat BUAT invoice, bukan dari form
Pelunasan.

## 4. Chart of Accounts (COA)

Didefinisikan di `src/lib/accounting/coa-seed.ts` (`COA_SEED` + `COA_CODE`), di-seed ke database
lewat `npx tsx scripts/seed-coa.ts` (idempotent — aman dijalankan ulang, upsert by code).

| Kode | Nama | Tipe | Dipakai oleh |
|---|---|---|---|
| 1-1000 | Kas & Bank | asset | Semua jurnal kas/bank (parent; tiap `Account` kas/bank punya akun anak sendiri `1-1xxx`) |
| 1-2000 | Piutang Usaha | asset | **Tidak dipakai jurnal baru** — cuma riwayat lama sebelum cash-basis berlaku |
| 1-3000 | Aset Tetap | asset | Belum dipakai jurnal otomatis manapun |
| 2-1000 | Hutang Usaha (Vendor) | liability | **Tidak dipakai** — HPP dianggap dibayar langsung dari kas, tidak pernah jadi utang |
| 2-2000 | PPN Keluaran | liability | `invoicePaymentLines` (PPN dari pelunasan invoice) |
| 2-3000 | Hutang Biaya Berkala | liability | **Tidak dipakai** oleh kode manapun saat ini |
| 3-1000 | Modal | equity | Belum dipakai jurnal otomatis manapun |
| 3-2000 | Laba Ditahan | equity | Belum dipakai jurnal otomatis manapun |
| 4-1000 | Pendapatan Jasa | revenue | Fallback `revenueCoaCodeForInvoice` (invoice manual/tanpa cost-link), `manualIncomeLines` |
| 4-2000 | Pendapatan Lain-lain | revenue | `COA_CODE.pendapatanLain` — dirujuk tapi belum ada caller aktif |
| 4-3000 | Pendapatan Project | revenue | Invoice Termin Project (`revenueCoaCode` eksplisit) |
| 4-4000 | Pendapatan Domain | revenue | Invoice dengan `costLinkType: "domain"` |
| 4-5000 | Pendapatan Server | revenue | Invoice dengan `costLinkType: "server"` |
| 4-6000 | Pendapatan Maintenance | revenue | Invoice dengan `costLinkType: "maintenance"` |
| 5-1000 | HPP | cogs | `invoicePaymentLines` (hppPortion), `manualIncomeLines` (cost) |
| 6-1000 | Beban Operasional Kantor | expense | `bebanCodeForCategory("kantor")` — Biaya Berkala |
| 6-2000 | Beban Pribadi/Prive | expense | `bebanCodeForCategory("pribadi")` — Biaya Berkala |
| 6-3000 | Beban Lain-lain | expense | `bebanCodeForCategory` fallback, `manualExpenseLines` tanpa kategori |
| 6-4000 | Beban Server & Hosting | expense | `markServerPaid` |
| 6-5000 | Beban Domain | expense | `markDomainPaid` |
| 6-6000 | Beban Maintenance | expense | `markMaintenancePaid` |

Akun kas/bank individual (`1-1001`, `1-1002`, dst) dibuat otomatis di bawah parent `1-1000` tiap
kali ada `Account` (kas/bank) baru yang belum ke-mapping — lihat `scripts/seed-coa.ts` bagian
backfill.

## 5. Gap yang diketahui (belum diperbaiki, sengaja dicatat di sini)

1. **AI Assistant "catat pemasukan/pengeluaran"** (`recordIncome`/`recordExpense` di
   `src/lib/agent-tools.ts`) membuat baris `Transaction` TAPI TIDAK PERNAH bikin jurnal
   (`JournalEntry`) sama sekali. Transaksi ini akan muncul di Laba Rugi (cash-basis, dari tabel
   `Transaction`) tapi TIDAK muncul di Laba Rugi Akrual / Buku Besar / COA (dari `JournalLine`).
   Kalau mau laporan akrual dipakai sebagai acuan utama, jalur ini perlu diperbaiki supaya ikut
   posting jurnal juga (pola yang sama dengan `manualIncomeLines`/`manualExpenseLines`).
2. **Akun 1-2000 (Piutang Usaha), 2-1000 (Hutang Usaha Vendor), 2-3000 (Hutang Biaya Berkala)**
   sekarang orphan — tidak dirujuk kode manapun untuk transaksi baru. Dibiarkan ada di COA untuk
   kompatibilitas riwayat (invoice lama sebelum migrasi cash-basis masih punya jurnal yang
   menunjuk ke 1-2000). Aman dibiarkan, tidak perlu dihapus.
3. **Invoice Termin Project tidak melacak HPP** (`totalCost` selalu 0) — jadi `hppPortion` di
   `invoicePaymentLines` otomatis 0 untuk invoice jenis ini, tidak perlu penanganan khusus.

## 6. Riwayat migrasi

- **Sebelum ini**: Invoice terbit langsung bikin jurnal akrual (Piutang debit, Pendapatan+PPN
  kredit, HPP debit/Kas kredit) — lihat `scripts/migrate-cash-basis-revenue.ts` (skrip migrasi
  yang sudah ditulis untuk kasus ini, TAPI TIDAK PERNAH DIJALANKAN — `correctionCount: 0` saat
  dicek). Ada juga tool "Rekalkulasi" (`src/lib/accounting/reconcile.ts` + tombolnya) yang
  arahnya JUSTRU mendorong invoice lama ke pola akrual — sudah **dihapus** karena sekarang
  berlawanan arah dengan aturan cash-basis ini.
- **2 invoice legacy** (`INV/2026/00018`, `INV/2026/00019`, klien NATURAFIT) yang sempat
  ter-posting dengan jurnal akrual lama sudah dikoreksi manual: jurnal `invoice_revenue` lama
  di-void, jurnal `invoice_payment` (masih draft, Payment-nya belum diposting) diperbaiki
  langsung ke akun Pendapatan Domain yang benar.
- **File-file kunci yang berubah** dalam migrasi ini: `src/lib/accounting/journal-rules.ts`
  (`invoicePaymentLines` diperluas, `invoiceRevenueLines`/`invoiceCostLines` dihapus),
  `src/app/api/invoices/route.ts` (hapus semua pembuatan jurnal), `src/app/api/invoices/[id]/post
  /route.ts` & `.../void/route.ts` & `.../route.ts` (hapus finalize/void/cleanup jurnal yang
  sudah tidak pernah ada), `src/app/api/payments/route.ts` (hitung `hppPortion`, resolve
  `revenueCoaCodeForInvoice`), `src/lib/accounting/coa-seed.ts` (3 akun Pendapatan baru +
  resolver), `src/lib/project-termin.ts` (hapus jurnal langsung, ikut jalur Payment biasa).

## 7. Dokumen terkait

- `aturan.txt` — sumber kebenaran aturan bisnis level tinggi.
- `Check-Flow.MD`, `Check-Flow-Server.MD`, `Check-Flow-Maintenance.MD`, `Check-Flow-BiayaBerkala.MD`,
  `Check-Flow-Invoice.MD` — jejak teknis alur tiap modul (domain/server/dst), termasuk kapan
  jurnal dibuat untuk masing-masing.
- Menu **Dokumentasi** di aplikasi (`src/components/dokumentasi/`) — versi staf awam dari
  Check-Flow di atas.
