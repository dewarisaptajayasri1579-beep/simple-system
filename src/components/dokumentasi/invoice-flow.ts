import type { FlowStep } from "./FlowTimeline";

/** Bahasa di file ini SENGAJA untuk pengguna awam (staf), bukan programmer — hindari istilah
 *  teknis (endpoint, nama field database, dsb). Kalau alurnya berubah di aplikasi, halaman ini
 *  wajib ikut diperbarui (lihat juga Check-Flow-Invoice.MD di root repo untuk versi teknisnya). */
export const invoiceManualSteps: FlowStep[] = [
  {
    no: "1",
    title: "Buat invoice baru",
    description:
      "Masuk ke menu Penjualan → \"Invoice Baru\". Pilih client (wajib), lalu isi baris tagihan — bisa pilih dari katalog Jasa/Barang (harga & HPP otomatis terisi), atau ketik manual.",
    detail: [
      "Tiap baris punya HPP (biaya modal) dan diskonnya sendiri-sendiri — bisa beda-beda per baris.",
      "Ada juga Diskon Tambahan (di luar diskon per baris) dan tombol aktifkan PPN kalau perlu.",
      "Tanggal jatuh tempo otomatis terisi 7 hari dari tanggal invoice, tapi bisa diganti manual.",
    ],
  },
  {
    no: "2",
    title: "Setujui invoicenya (Posting)",
    description: "Buka invoice yang baru dibuat, cek datanya sudah benar, lalu klik \"Posting Invoice\".",
    detail: [
      "Selama masih Draft, invoice ini belum bisa dipakai buat terima pembayaran, dan belum kehitung di Piutang/laporan keuangan.",
      "Begitu di-posting, Piutang Usaha dan Pendapatan langsung diakui di pembukuan SAAT ITU JUGA — bukan nunggu client bayar. Ini beda dengan uang kas yang baru masuk pas benar-benar dibayar (lihat menu Pembayaran).",
    ],
  },
  {
    no: "3",
    title: "Client bayar → input di menu Pembayaran",
    description: "Setelah client transfer, staf catat pelunasannya di menu Pembayaran — bisa sekaligus lunas, atau dicicil beberapa kali.",
    detail: [
      "Status invoice (Belum Dibayar/Dicicil/Lunas) otomatis update begitu pembayarannya di-posting.",
      "Kalau client bilang sudah transfer lewat WhatsApp tapi staf belum sempat verifikasi/input, invoice bisa ditandai \"Diklaim Lunas\" oleh AI Agent — ini CUMA tanda peringatan buat staf cek mutasi rekening, BUKAN pencatatan resmi. Begitu staf input pembayaran beneran, statusnya otomatis dikoreksi sesuai pembayaran yang tercatat.",
    ],
  },
];

export const invoiceCaveats: string[] = [
  "Pendapatan & PPN diakui di pembukuan SAAT INVOICE DIPOSTING, bukan saat dibayar — beda dengan kas yang baru tercatat masuk pas Pembayaran-nya di-posting. Jadi laporan Laba Rugi bisa menunjukkan pendapatan dari invoice yang belum tentu sudah dibayar client (piutang).",
  "Invoice yang masih Draft TIDAK bisa diedit langsung — kalau salah input, cara paling gampang adalah Hapus draft-nya lalu input ulang dari awal (tombol Hapus cuma muncul selama masih draft).",
  "Invoice yang sudah Posted cuma bisa dibatalkan (\"Void\") oleh Owner, dan CUMA BISA kalau belum ada pembayaran yang tercatat untuk invoice itu — kalau sudah ada pembayaran (walau baru sebagian), batalkan dulu pembayarannya sebelum bisa membatalkan invoice-nya.",
  "Status \"Diklaim Lunas\" bukan status resmi lunas — itu cuma flag dari AI Agent kalau client bilang sudah bayar via chat. Piutang invoice itu tetap dianggap belum lunas di semua laporan sampai staf beneran input & posting pembayarannya.",
  "Invoice untuk Domain/Server/Maintenance yang dibuat lewat \"Tagih Sekarang\" otomatis \"diingat\" terkait ke item itu — includingnya udah dijelaskan di dokumentasi masing-masing modul (Domain/Server/Maintenance).",
  "Invoice Termin Project (dari jadwal pembayaran proyek) jalannya beda total — dibuat OTOMATIS oleh sistem 3 hari sebelum jatuh tempo, langsung berstatus Posted (tidak lewat draft), dan tidak melacak HPP/PPN seperti invoice biasa. Lihat dokumentasi menu Proyek untuk detailnya.",
]
