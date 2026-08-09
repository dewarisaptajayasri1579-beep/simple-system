import type { FlowStep } from "./FlowTimeline";

/** Bahasa di file ini SENGAJA untuk pengguna awam (staf), bukan programmer — hindari istilah
 *  teknis (endpoint, nama field database, dsb). Kalau alurnya berubah di aplikasi, halaman ini
 *  wajib ikut diperbarui (lihat juga Check-Flow-Server.MD di root repo untuk versi teknisnya). */
export const serverClientSteps: FlowStep[] = [
  {
    no: "1",
    title: "Server didaftarkan ke sistem",
    description:
      "Masuk ke Pengaturan → Master Data → Server, klik \"Tambah Server\", lalu isi datanya: nama server, IP, vendor, spesifikasi (Core/RAM/Storage), ini milik Client mana (atau kosongkan kalau punya sendiri/Internal), harganya, dan siklus tagihannya (bulanan/tahunan/dst).",
    detail: [
      "Beda dengan Domain (yang cuma bisa diedit, tidak bisa tambah baru dari halaman ini), Server BISA didaftarkan baru langsung dari Master Data.",
      "Tanggal jatuh tempo berikutnya DIHITUNG OTOMATIS dari \"Terakhir Dibayar\" + siklus tagihan yang dipilih — bukan tanggal yang diisi manual seperti \"Tgl Berakhir\" di Domain.",
    ],
  },
  {
    no: "2",
    title: "Muncul otomatis di Dashboard",
    description:
      "Kalau server sudah lewat jatuh tempo, jatuh tempo bulan ini, atau bulan depan, server ini otomatis muncul di Dashboard supaya tidak kelupaan diperpanjang.",
    detail: [
      "Nama client pemiliknya, nama PIC, dan nomor WA-nya langsung kelihatan di situ, lengkap dengan tombol \"Klik WA\" buat langsung follow-up.",
    ],
  },
  {
    no: "3",
    title: "Klik \"Tagih Sekarang\"",
    description:
      "Kalau servernya milik client, tinggal klik tombol \"Tagih Sekarang\" di Dashboard — sistem otomatis buatkan tagihan (invoice) buat client itu dengan nominal sesuai harga server-nya.",
    detail: [
      "Tagihan yang baru dibuat statusnya masih \"Draft\" — belum resmi, masih bisa dicek/diperbaiki dulu sebelum ditagihkan beneran ke client.",
      "Tagihan ini otomatis \"diingat\" terkait ke server yang mana — jadi nanti pas dibayar, sistem sudah tahu sendiri server mana yang dimaksud (lihat langkah 5).",
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
    title: "Client bayar, staf input pembayarannya",
    description: "Setelah client transfer, staf masuk ke menu Pembayaran, pilih tagihan yang mau dilunasi, lalu isi jumlah yang dibayar.",
    detail: [
      "Kalau tagihannya dibuat lewat \"Tagih Sekarang\" (langkah 3), opsi \"Bayar Server\" dan server-nya SUDAH otomatis kepilih — staf tinggal isi berapa biaya modal server-nya (HPP), tidak perlu pilih ulang server-nya lagi.",
      "Kalau tagihannya dibuat manual (bukan dari \"Tagih Sekarang\"), staf tetap wajib pilih sendiri opsi \"Bayar Server\" dan server-nya di form Pembayaran, kalau tidak server-nya TIDAK dianggap sudah diperpanjang.",
    ],
  },
  {
    no: "6",
    title: "Setujui pembayarannya (Posting)",
    description: "Setelah pembayaran diklik \"Posting\", tagihan client otomatis berubah jadi Lunas.",
    detail: [
      "Kalau tadi server-nya sudah ditandai di langkah 5, \"Terakhir Dibayar\" server ini otomatis terisi tanggal pembayaran hari ini, lalu jatuh tempo berikutnya dihitung ulang otomatis dari tanggal itu + siklus tagihannya.",
      "PENTING, ini beda dengan Domain: kalau pembayarannya telat/mundur, jatuh tempo berikutnya Server ikut mundur dari tanggal bayar yang sebenarnya (bukan dari jatuh tempo lama). Jadi usahakan input pembayaran secepatnya, jangan ditunda-tunda.",
    ],
  },
  {
    no: "7",
    title: "Tercatat rapi di pembukuan perusahaan",
    description:
      "Semua uang yang masuk dari pembayaran ini, dan biaya modal server-nya (kalau ada), otomatis tercatat di laporan keuangan — tidak perlu dicatat manual lagi.",
    detail: ["Yang kecatat: uang masuk ke kas/bank, pendapatan jasa bertambah, PPN (kalau ada), dan biaya modal server (kalau dikaitkan)."],
  },
];

export const serverInternalSteps: FlowStep[] = [
  {
    no: "1",
    title: "Muncul di Dashboard sebagai \"Internal\"",
    description: "Server yang bukan buat ditagihkan ke client (dipakai sendiri oleh perusahaan) tombolnya beda: tertulis \"Tandai Lunas\", bukan \"Tagih Sekarang\".",
  },
  {
    no: "2",
    title: "Klik \"Tandai Lunas\"",
    description:
      "Begitu server ini dibayar/diperpanjang, klik \"Tandai Lunas\" langsung dari Dashboard, ATAU catat lewat menu Keuangan → Kas Keluar dengan memilih tipe \"Bayar Server\".",
    detail: ["Server internal seperti ini tidak pernah lewat proses tagihan/invoice sama sekali — karena memang tidak ditagihkan ke siapa-siapa."],
  },
  {
    no: "3",
    title: "Otomatis tercatat sebagai pengeluaran",
    description: "Begitu dicatat, langsung jadi pengeluaran perusahaan (Beban Server/Hosting) di pembukuan.",
  },
  {
    no: "4",
    title: "Disetujui (Posting)",
    description: "Setelah disetujui, \"Terakhir Dibayar\" server-nya terisi tanggal ini, jatuh tempo berikutnya otomatis dihitung ulang, dan pengeluarannya resmi masuk laporan keuangan.",
  },
];

export const serverCaveats: string[] = [
  "Tombol \"Tagih Sekarang\" sekarang otomatis mengaitkan tagihannya ke server yang dimaksud, jadi pas dibayar, opsi \"Bayar Server\" sudah otomatis kepilih. TAPI kalau tagihannya dibuat manual (bukan lewat \"Tagih Sekarang\"), staf tetap wajib pilih sendiri server-nya pas input pembayaran — kalau lupa, jatuh tempo server-nya tidak akan berubah walau tagihannya sudah lunas.",
  "Tagihan dan pembayaran yang masih berstatus \"Draft\" belum dihitung di mana pun (Dashboard, laporan keuangan, saldo kas) — wajib disetujui (\"Posting\") dulu satu-satu, tagihannya dulu baru pembayarannya.",
  "Beda penting dari Domain: jatuh tempo Server dihitung ULANG dari tanggal bayar yang sebenarnya (\"Terakhir Dibayar\" + siklus tagihan), bukan dari jatuh tempo lama + 1 tahun seperti Domain. Jadi kalau bayar server telat, jatuh tempo berikutnya ikut mundur — bukan cuma \"nombok\" bulan yang telat itu saja.",
  "Server BISA didaftarkan baru langsung dari Master Data (tombol \"Tambah Server\") — beda dengan Domain yang cuma bisa diedit, tidak bisa ditambah dari halaman itu.",
]
