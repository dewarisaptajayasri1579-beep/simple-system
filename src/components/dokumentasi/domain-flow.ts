import type { FlowStep } from "./FlowTimeline";

/** Bahasa di file ini SENGAJA untuk pengguna awam (staf), bukan programmer — hindari istilah
 *  teknis (endpoint, nama field database, dsb). Kalau alurnya berubah di aplikasi, halaman ini
 *  wajib ikut diperbarui (lihat juga Check-Flow.MD di root repo untuk versi teknisnya). */
export const domainClientSteps: FlowStep[] = [
  {
    no: "1",
    title: "Domain didaftarkan ke sistem",
    description:
      "Masuk ke Pengaturan → Master Data → Domain, lalu isi data domainnya: nama domain, ini milik Client mana (atau punya sendiri/Internal kalau bukan buat client), berapa harga jualnya, dan kapan terakhir dibayar.",
    detail: [
      "Ada 2 tanggal yang beda artinya: \"Tgl Terakhir Bayar\" (kapan terakhir kali dibayar) dan \"Tgl Berakhir\" (kapan domain ini harus diperpanjang lagi). Isi juga \"Tgl Berakhir\"-nya kalau sudah tahu, supaya sistem bisa mengingatkan pas mau habis.",
    ],
  },
  {
    no: "2",
    title: "Muncul otomatis di Dashboard",
    description:
      "Kalau domainnya sudah lewat, akan habis bulan ini, atau bulan depan, domain ini otomatis muncul di Dashboard supaya tidak kelupaan diperpanjang.",
    detail: [
      "Nama client pemiliknya, nama PIC, dan nomor WA-nya langsung kelihatan di situ, lengkap dengan tombol \"Klik WA\" buat langsung follow-up.",
    ],
  },
  {
    no: "3",
    title: "Klik \"Tagih Sekarang\"",
    description:
      "Kalau domainnya milik client, tinggal klik tombol \"Tagih Sekarang\" di Dashboard — sistem otomatis buatkan tagihan (invoice) buat client itu dengan nominal sesuai harga jual domainnya.",
    detail: ["Tagihan yang baru dibuat statusnya masih \"Draft\" — belum resmi, masih bisa dicek/diperbaiki dulu sebelum ditagihkan beneran ke client."],
  },
  {
    no: "4",
    title: "Setujui tagihannya (Posting)",
    description: "Buka tagihan yang baru dibuat, cek datanya sudah benar, lalu klik tombol \"Posting Invoice\" supaya tagihan itu resmi diterbitkan.",
    detail: ["Selama belum diklik \"Posting\", tagihan ini belum bisa dipakai buat terima pembayaran dari client."],
  },
  {
    no: "5",
    title: "Client bayar, staf input pembayarannya",
    description: "Setelah client transfer, staf masuk ke menu Pembayaran, pilih tagihan yang mau dilunasi, lalu isi jumlah yang dibayar.",
    detail: [
      "PENTING: kalau pembayaran ini juga buat memperpanjang domainnya, wajib pilih opsi \"Bayar Domain\" dan tandai domain yang dimaksud di form Pembayaran itu.",
      "Kalau langkah pilih domain ini dilewati, pembayarannya tetap tercatat, tapi domainnya TIDAK dianggap sudah diperpanjang.",
    ],
  },
  {
    no: "6",
    title: "Setujui pembayarannya (Posting)",
    description: "Setelah pembayaran diklik \"Posting\", tagihan client otomatis berubah jadi Lunas.",
    detail: [
      "Kalau tadi domainnya sudah ditandai di langkah 5, tanggal berakhir domain ini otomatis maju 1 tahun dari tanggal berakhir yang lama.",
    ],
  },
  {
    no: "7",
    title: "Tercatat rapi di pembukuan perusahaan",
    description:
      "Semua uang yang masuk dari pembayaran ini, dan biaya modal domainnya (kalau ada), otomatis tercatat di laporan keuangan — tidak perlu dicatat manual lagi.",
    detail: ["Yang kecatat: uang masuk ke kas/bank, pendapatan jasa bertambah, PPN (kalau ada), dan biaya modal domain (kalau dikaitkan)."],
  },
];

export const domainInternalSteps: FlowStep[] = [
  {
    no: "1",
    title: "Muncul di Dashboard sebagai \"Internal\"",
    description: "Domain yang bukan buat ditagihkan ke client (dipakai sendiri oleh perusahaan) tombolnya beda: tertulis \"Tandai Lunas\", bukan \"Tagih Sekarang\".",
  },
  {
    no: "2",
    title: "Klik \"Tandai Lunas\"",
    description:
      "Begitu domain ini dibayar/diperpanjang, klik \"Tandai Lunas\" langsung dari Dashboard, ATAU catat lewat menu Keuangan → Kas Keluar dengan memilih tipe \"Bayar Domain\".",
    detail: ["Domain internal seperti ini tidak pernah lewat proses tagihan/invoice sama sekali — karena memang tidak ditagihkan ke siapa-siapa."],
  },
  {
    no: "3",
    title: "Otomatis tercatat sebagai pengeluaran",
    description: "Begitu dicatat, langsung jadi pengeluaran perusahaan (Beban Domain) di pembukuan.",
  },
  {
    no: "4",
    title: "Disetujui (Posting)",
    description: "Setelah disetujui, tanggal berakhir domainnya otomatis maju 1 tahun, dan pengeluarannya resmi masuk laporan keuangan.",
  },
];

export const domainCaveats: string[] = [
  "Tombol \"Tagih Sekarang\" cuma membuatkan tagihannya saja — TIDAK otomatis menghubungkan tagihan itu ke domainnya. Jadi pas input pembayaran, jangan lupa pilih & kaitkan ke domain yang dimaksud, kalau tidak, tanggal berakhir domainnya tidak akan berubah walau tagihannya sudah lunas.",
  "Tagihan dan pembayaran yang masih berstatus \"Draft\" belum dihitung di mana pun (Dashboard, laporan keuangan, saldo kas) — wajib disetujui (\"Posting\") dulu satu-satu, tagihannya dulu baru pembayarannya.",
  "\"Tgl Terakhir Bayar\" dan \"Tgl Berakhir\" itu dua hal yang beda: Tgl Terakhir Bayar cuma catatan kapan terakhir kali transfer; Tgl Berakhir itu yang menentukan kapan domainnya harus diperpanjang dan yang dipakai buat memunculkan peringatan di Dashboard.",
]
