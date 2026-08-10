import type { FlowStep } from "./FlowTimeline";

/** Bahasa di file ini SENGAJA untuk pengguna awam (staf), bukan programmer — hindari istilah
 *  teknis (endpoint, nama field database, dsb). Kalau alurnya berubah di aplikasi, halaman ini
 *  wajib ikut diperbarui (lihat juga Check-Flow-Maintenance.MD di root repo untuk versi teknisnya).
 *
 *  Beda dari Domain/Server: Maintenance WAJIB punya Client (tidak ada jalur "Internal"), dan
 *  tidak punya "Tgl Berakhir" — jatuh tempo dihitung murni dari "Tgl Tagihan Terakhir" +
 *  siklus. Karena itu cuma ada 1 rangkaian langkah di bawah, bukan 2 (Client & Internal). */
export const maintenanceSteps: FlowStep[] = [
  {
    no: "1",
    title: "Maintenance didaftarkan ke sistem",
    description:
      "Masuk ke Pengaturan → Master Data → Maintenance, klik \"Tambah Maintenance\", lalu isi datanya: nama jasa maintenance-nya, ini untuk Client mana (WAJIB diisi, tidak bisa dikosongkan), harganya, Periode Tagihan (per berapa bulan), tanggal tagihan tiap periode (cukup angka 1-31), dan Bulan Mulai (bulan+tahun kontrak ini dimulai, cuma catatan).",
    detail: [
      "Beda dari Domain/Server, Maintenance TIDAK punya opsi \"Internal\" — setiap baris Maintenance harus terkait ke 1 Client tertentu, karena memang selalu jasa yang dikerjakan untuk client.",
      "\"Tgl Tagihan\" cukup diisi tanggalnya saja (1-31) — bulan & tahunnya otomatis ikut bulan saat disimpan, tidak perlu pilih tanggal lengkap.",
      "\"Bulan Mulai\" murni catatan kontrak (kapan mulai berlangganan) — TIDAK dipakai buat menghitung jatuh tempo, itu tetap dari \"Tgl Tagihan\" + Periode.",
    ],
  },
  {
    no: "2",
    title: "Muncul otomatis di Dashboard",
    description: "Kalau maintenance-nya sudah lewat jatuh tempo, jatuh tempo bulan ini, atau bulan depan, otomatis muncul di Dashboard supaya tidak kelupaan ditagih lagi — sama pola dengan Domain/Server.",
    detail: [
      "Nama client pemiliknya, nama PIC, dan nomor WA-nya langsung kelihatan di situ, lengkap dengan tombol \"Klik WA\" buat langsung follow-up.",
    ],
  },
  {
    no: "3",
    title: "Klik \"Tagih Sekarang\"",
    description:
      "Tinggal klik tombol \"Tagih Sekarang\" di Dashboard — sistem otomatis buatkan tagihan (invoice) buat client itu dengan nominal sesuai harga maintenance-nya.",
    detail: [
      "Tagihan yang baru dibuat statusnya masih \"Draft\" — belum resmi, masih bisa dicek/diperbaiki dulu sebelum ditagihkan beneran ke client.",
      "Tagihan ini otomatis \"diingat\" terkait ke maintenance yang mana.",
    ],
  },
  {
    no: "4",
    title: "Setujui tagihannya (Posting)",
    description: "Buka tagihan yang baru dibuat, cek datanya sudah benar, lalu klik tombol \"Posting Invoice\" supaya tagihan itu resmi diterbitkan.",
    detail: ["Selama belum diklik \"Posting\", tagihan ini belum bisa dipakai buat terima pembayaran dari client."],
  },
  {
    no: "5",
    title: "Client bayar, staf input pembayarannya — WAJIB pilih manual",
    description: "Setelah client transfer, staf masuk ke menu Pembayaran, pilih tagihan yang mau dilunasi, lalu isi jumlah yang dibayar.",
    detail: [
      "PENTING, ini beda dari Domain/Server: opsi \"Bayar Maintenance\" di form Pembayaran TIDAK otomatis kepilih walau tagihannya dibuat lewat \"Tagih Sekarang\". Staf WAJIB pilih sendiri opsi \"Bayar Maintenance\" dan maintenance-nya secara manual setiap kali — kalau lupa, maintenance-nya TIDAK dianggap sudah ditagih ulang walau invoice-nya sudah lunas.",
    ],
  },
  {
    no: "6",
    title: "Setujui pembayarannya (Posting)",
    description: "Setelah pembayaran diklik \"Posting\", tagihan client otomatis berubah jadi Lunas.",
    detail: [
      "Kalau tadi maintenance-nya sudah dipilih manual di langkah 5, \"Tgl Tagihan Terakhir\" otomatis terisi tanggal pembayaran ini — jatuh tempo berikutnya dihitung ulang otomatis dari tanggal itu + siklus tagihannya (beda dari Domain/Server yang sekarang pakai \"Tgl Berakhir\" sebagai acuan, Maintenance tidak punya itu).",
    ],
  },
  {
    no: "7",
    title: "Tercatat rapi di pembukuan perusahaan",
    description:
      "Semua uang yang masuk dari pembayaran ini, dan biaya modal maintenance-nya (kalau ada), otomatis tercatat di laporan keuangan — tidak perlu dicatat manual lagi.",
    detail: ["Yang kecatat: uang masuk ke kas/bank, pendapatan jasa bertambah, PPN (kalau ada), dan biaya maintenance (kalau dikaitkan)."],
  },
  {
    no: "8",
    title: "Atau: Tandai Lunas langsung (tanpa tagihan)",
    description:
      "Kalau memang mau langsung dicatat sebagai bayar keluar tanpa lewat proses tagihan (mis. maintenance yang tidak ditagihkan formal), klik \"Tandai Lunas\" di Master Data, ATAU catat lewat Keuangan → Kas Keluar dengan Tipe \"Bayar Maintenance\".",
    detail: ["Ini jalur terpisah dari langkah 1-7 di atas — dua-duanya sah, tinggal pilih sesuai kebutuhan."],
  },
];

export const maintenanceCaveats: string[] = [
  "Maintenance WAJIB punya Client — tidak ada jalur \"Internal\" seperti Domain/Server, karena maintenance memang selalu jasa untuk client tertentu.",
  "GAP PENTING: opsi \"Bayar Maintenance\" di form Pembayaran TIDAK auto-terpilih dari \"Tagih Sekarang\" (beda dari Domain/Server yang otomatis). Staf wajib pilih sendiri setiap kali input pembayaran, kalau tidak jatuh tempo maintenance tidak akan maju walau invoice-nya sudah lunas.",
  "Maintenance tidak punya \"Tgl Berakhir\" seperti Domain/Server — jatuh tempo SELALU dihitung ulang dari \"Tgl Tagihan Terakhir\" + siklus periode, jadi kalau bayar/tagih telat, jatuh tempo berikutnya ikut mundur dari tanggal itu (bukan tetap dari jadwal lama).",
  "Tagihan dan pembayaran yang masih berstatus \"Draft\" belum dihitung di mana pun (Dashboard, laporan keuangan, saldo kas) — wajib disetujui (\"Posting\") dulu satu-satu, tagihannya dulu baru pembayarannya.",
]
