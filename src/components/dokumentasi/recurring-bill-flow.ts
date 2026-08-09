import type { FlowStep } from "./FlowTimeline";

/** Bahasa di file ini SENGAJA untuk pengguna awam (staf), bukan programmer — hindari istilah
 *  teknis (endpoint, nama field database, dsb). Kalau alurnya berubah di aplikasi, halaman ini
 *  wajib ikut diperbarui (lihat juga Check-Flow-BiayaBerkala.MD di root repo untuk versi teknisnya).
 *
 *  Beda mendasar dari Domain/Server/Maintenance: Biaya Berkala BUKAN ditagihkan ke Client —
 *  ini pengeluaran rutin perusahaan sendiri (listrik, internet, langganan, dsb), dibayar ke
 *  Vendor, tidak pernah lewat Invoice/Piutang sama sekali. */
export const recurringBillSteps: FlowStep[] = [
  {
    no: "1",
    title: "Tambah atau edit di Master Data",
    description:
      "Masuk ke Pengaturan → Master Data → Biaya Berkala. Klik \"Tambah Biaya Berkala\" untuk daftar baru, atau klik ikon pensil di baris yang sudah ada untuk edit.",
    detail: [
      "Yang bisa diisi/diedit: nama, \"Nomor ID/Keterangan\" (mis. nomor pelanggan PLN, ID akun langganan), Vendor, Kategori (Kantor/Pribadi/Lainnya), Nominal, dan Aktif/tidaknya.",
      "Kalau sudah tidak dipakai lagi (langganan dihentikan, dsb), klik toggle \"Aktif\" di kolomnya untuk nonaktifkan — baris yang nonaktif otomatis tidak muncul lagi di Dashboard/Laporan, tapi datanya tetap tersimpan (tidak dihapus).",
    ],
  },
  {
    no: "2",
    title: "Muncul otomatis di Dashboard",
    description: "Kalau sudah lewat jatuh tempo, atau jatuh tempo bulan ini, otomatis muncul di Dashboard bagian \"Biaya Rutin\".",
    detail: ["\"Nomor ID/Keterangan\"-nya bisa langsung diklik dan diedit di situ juga, tidak perlu buka Master Data."],
  },
  {
    no: "3",
    title: "Diingatkan otomatis via WhatsApp",
    description:
      "Beda dari Domain/Server/Maintenance, Biaya Berkala punya pengingat WhatsApp otomatis — sistem akan chat semua staf yang punya nomor WA terdaftar: \"Reminder biaya berkala: [nama] ([nominal]) sudah/segera jatuh tempo. Sudah dibayar? Balas 'sudah [nama]' atau 'belum'.\"",
    detail: [
      "PENTING: kalau staf balas \"sudah [nama]\" via WA, sistem cuma mencatat tanggal terakhir bayar — TIDAK otomatis bikin catatan pengeluaran/jurnal di pembukuan. Supaya beneran tercatat di laporan keuangan, tetap wajib input lewat langkah 4 di bawah (Tandai Lunas atau Kas Keluar).",
    ],
  },
  {
    no: "4",
    title: "Bayar lewat \"Tandai Lunas\" atau Kas Keluar",
    description:
      "Ada 2 cara: klik \"Tandai Lunas\" langsung di Master Data (isi akun kas/bank), ATAU dari Dashboard klik \"Bayar Sekarang\" yang akan membuka Keuangan → Kas Keluar dengan baris \"Bayar Biaya Berkala\" sudah otomatis terisi.",
    detail: [
      "Kedua cara ini SAMA-SAMA bikin catatan pengeluaran resmi (Transaction + jurnal draft) — beda dari balas WA \"sudah\" di langkah 3 yang cuma catatan tanggal doang.",
      "Akun beban (kategori pengeluaran) di jurnal otomatis mengikuti Kategori yang diisi di Master Data: Kantor, Pribadi, atau Lainnya — masing-masing masuk akun beban yang berbeda.",
    ],
  },
  {
    no: "5",
    title: "Setujui (Posting)",
    description: "Setelah disetujui (\"Posting\") di menu Kas Keluar, \"Terakhir Bayar\" otomatis terisi tanggal ini, dan pengeluarannya resmi masuk laporan keuangan.",
    detail: ["Selama masih Draft, pengeluaran ini belum kehitung di laporan keuangan atau saldo kas."],
  },
];

export const recurringBillCaveats: string[] = [
  "Nonaktifkan (bukan hapus) kalau sudah tidak dipakai — pakai toggle \"Aktif\" di tabel Master Data. Ini beda dari menghapus: datanya tetap tersimpan (untuk riwayat/audit), cuma tidak lagi kehitung di Dashboard, pengingat WA, dan Laporan.",
  "PENTING: balas WhatsApp \"sudah [nama]\" ke reminder otomatis TIDAK bikin catatan pengeluaran di pembukuan — cuma menandai tanggal terakhir bayar di sistem. Supaya beneran tercatat, tetap wajib klik \"Tandai Lunas\" di Master Data atau lewat Keuangan → Kas Keluar.",
  "Dashboard cuma nampilin yang \"Sudah Lewat\" dan \"Bulan Ini\" — tidak ada peringatan \"Bulan Depan\". Tapi pengingat WhatsApp otomatis mengecek lebih ketat (pakai ambang hari dari pengaturan Periode-nya), jadi kadang WA reminder sudah masuk duluan sebelum kelihatan di Dashboard.",
  "Kategori (Kantor/Pribadi/Lainnya) menentukan akun beban di pembukuan — pastikan kategorinya benar sebelum ditandai lunas, karena itu yang menentukan pos pengeluaran mana yang kena di laporan.",
  "Ini beda total dari Domain/Server/Maintenance: Biaya Berkala bukan ditagihkan ke Client, jadi tidak ada Invoice/Piutang/\"Tagih Sekarang\" sama sekali — murni pengeluaran perusahaan ke Vendor.",
]
