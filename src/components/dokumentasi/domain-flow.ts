import type { FlowStep } from "./FlowTimeline";

/** Isi diambil dari Check-Flow.MD (dicek langsung ke kode, bukan asumsi) — kalau alurnya
 *  berubah di kode, halaman ini ikut wajib diperbarui, bukan cuma file .MD-nya. */
export const domainClientSteps: FlowStep[] = [
  {
    no: "1",
    title: "Input Master Data",
    description:
      "Pengaturan → Master Data → tab Domain. Field kunci: name, clientId (kosong = Internal), sellPrice, lastPaidAt (kapan terakhir dibayar), expiryDate / \"Tgl Berakhir\" (kapan servicenya berakhir — acuan renewal), active.",
    detail: [
      "lastPaidAt dan expiryDate dua field terpisah dengan arti beda — dulu digabung (expiry selalu dihitung dari lastPaidAt+1 tahun), sekarang expiryDate eksplisit disimpan sendiri.",
      "Domain lama (sebelum expiryDate ada) di-backfill: expiryDate = lastPaidAt lamanya, lalu bisa dikoreksi manual per domain lewat kolom \"Tgl Berakhir\" yang klik-untuk-edit.",
    ],
    refs: ["POST /api/domains", "MasterDataPanel.tsx", "DomainDateCell.tsx"],
  },
  {
    no: "2",
    title: "Muncul di Dashboard",
    description: "Section \"Domain — Lewat / Bulan Ini / Bulan Depan\" — syarat tampil: active=true DAN bucket-nya expired/bulan ini/bulan depan.",
    detail: [
      "Kolom Pemilik menampilkan nama client + PIC + No. WA + tombol follow-up.",
      "Kolom Aksi menampilkan tombol \"Tagih Sekarang\" karena domain ini punya clientId.",
    ],
    refs: ["DashboardSections.tsx", "domain-status.ts"],
  },
  {
    no: "3",
    title: "Jadi Tagihan (Invoice, Draft)",
    description: "Klik \"Tagih Sekarang\" → prefill client + nominal ke form invoice baru. Belum otomatis nyambung ke Domain-nya secara struktural.",
    detail: [
      "Invoice dibuat dengan postStatus \"draft\" dan status piutang \"unpaid\".",
      "Cash-basis: piutang/pendapatan belum diakui di titik ini.",
      "Kalau baris invoice diisi HPP, langsung dibuat 1 jurnal HPP (draft): debit HPP, kredit Hutang Usaha Vendor.",
    ],
    refs: ["POST /api/invoices", "penjualan/baru"],
  },
  {
    no: "4",
    title: "Posting Invoice",
    description: "Tombol \"Posting Invoice\" di halaman detail invoice — wajib sebelum bisa dibayar.",
    detail: ["Invoice draft TIDAK muncul di daftar pilihan form Pembayaran sampai diposting."],
    refs: ["POST /api/invoices/:id/post", "InvoicePostButton.tsx"],
  },
  {
    no: "5",
    title: "Input Pembayaran",
    description: "Titik ini pendapatan baru diakui (cash-basis): debit Kas/Bank, kredit Pendapatan Jasa, kredit PPN Keluaran kalau ada PPN.",
    detail: [
      "Opsional: kaitkan biaya ke Domain lewat costMode \"domain\" — kalau dipakai, markDomainPaid() otomatis jalan bareng (Transaction + jurnal Beban Domain terpisah, 1 paymentId yang sama).",
      "Kalau langkah ini dilewati, pembayaran tetap sukses tapi Domain.lastPaidAt TIDAK ikut ter-update.",
    ],
    refs: ["POST /api/payments", "PembayaranForm.tsx"],
  },
  {
    no: "6",
    title: "Posting Payment",
    description: "Semua Transaction dengan paymentId yang sama (baris pendapatan + baris Beban Domain kalau ada) diposting sekaligus, atomik.",
    detail: [
      "Invoice.status dihitung ulang: unpaid → partial/paid.",
      "Kalau ada cost-link Domain: Domain.lastPaidAt di-update ke tanggal transaksi itu, DAN Domain.expiryDate (\"Tgl Berakhir\") ditambah 1 tahun dari expiryDate SEBELUMNYA — bukan dari tanggal bayar, supaya telat bayar tidak menggeser siklus jatuh tempo tahun depan.",
    ],
    refs: ["POST /api/payments/:id/post", "finalizeTransactionPosting()"],
  },
  {
    no: "7",
    title: "COA / Buku Besar / Laporan",
    description: "Cuma JournalLine yang jurnalnya postStatus=posted yang dihitung — draft dan voided dikecualikan.",
    detail: [
      "Kas & Bank — debit (pembayaran invoice), kredit (Beban Domain kalau dari akun yang sama).",
      "Pendapatan Jasa — kredit, sebesar (jumlah dibayar − porsi PPN).",
      "PPN Keluaran — kredit, kalau invoice pakai PPN.",
      "Beban Domain — debit, HANYA kalau ada cost-link.",
      "HPP + Hutang Usaha Vendor — HANYA kalau invoice diisi HPP saat dibuat.",
    ],
    refs: ["akuntansi/coa", "akuntansi/buku-besar"],
  },
];

export const domainInternalSteps: FlowStep[] = [
  {
    no: "1",
    title: "Muncul di Dashboard sebagai Internal",
    description: "Domain tanpa clientId — kolom Aksi menampilkan tombol \"Tandai Lunas\", bukan \"Tagih Sekarang\".",
    refs: ["DashboardSections.tsx"],
  },
  {
    no: "2",
    title: "Tandai Lunas",
    description: "Dua pintu, satu fungsi yang sama: tombol cepat di Dashboard, ATAU Keuangan → Kas Keluar (Tipe baris \"Bayar Domain\").",
    detail: ["Domain internal TIDAK PERNAH masuk Invoice/Piutang/Payment sama sekali."],
    refs: ["POST /api/domains/:id/mark-paid", "POST /api/transactions/kas-keluar"],
  },
  {
    no: "3",
    title: "markDomainPaid()",
    description: "Transaction expense (draft) + jurnal Beban Domain (draft) langsung dibuat, tanpa Invoice/Payment.",
    refs: ["mark-paid.ts"],
  },
  {
    no: "4",
    title: "Posting",
    description: "Setelah diposting: Domain.lastPaidAt ter-update ke tanggal bayar, DAN Domain.expiryDate (\"Tgl Berakhir\") maju 1 tahun dari expiryDate sebelumnya + Beban Domain masuk COA.",
    refs: ["POST /api/transactions/:id/post"],
  },
];

export const domainCaveats: string[] = [
  "\"Tagih Sekarang\" tidak otomatis mengaitkan Domain ke invoice-nya — hubungan itu cuma kejadian kalau staf secara sadar pakai fitur cost-link pas isi form Pembayaran. Tanpa itu, expiryDate domain tetap tanggal lama walau invoice-nya sudah lunas.",
  "Invoice & Payment draft tidak kehitung di mana pun (Dashboard, COA, Buku Besar, saldo Kas) sampai eksplisit diposting — dua langkah posting terpisah (Invoice, lalu Payment) wajib dilakukan berurutan.",
  "HPP domain bisa \"diakui\" di 2 titik yang beda maknanya: HPP di baris Invoice (diakui saat invoice dibuat, lawan akun Hutang Usaha Vendor) vs Beban Domain lewat cost-link/Tandai Lunas (diakui saat benar-benar dibayar, lawan akun Kas/Bank) — biasanya cuma salah satu yang dipakai untuk 1 domain yang sama.",
  "lastPaidAt dan expiryDate sengaja dipisah: lastPaidAt = kapan terakhir dibayar (catatan historis), expiryDate = kapan servicenya benar-benar berakhir (acuan renewal). Yang dipakai buat status Lewat/Bulan Ini/Bulan Depan di Dashboard SELALU expiryDate, bukan lastPaidAt.",
]
