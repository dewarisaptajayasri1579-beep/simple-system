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
      "Ada 2 tanggal yang beda artinya, sama seperti Domain: \"Terakhir Dibayar\" (kapan terakhir kali dibayar) dan \"Tgl Berakhir\" (kapan servernya harus diperpanjang lagi — acuan renewal resmi). Isi juga \"Tgl Berakhir\"-nya kalau sudah tahu, supaya sistem bisa mengingatkan pas mau habis.",
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
      "Kalau tadi server-nya sudah ditandai di langkah 5, \"Tgl Berakhir\" server ini otomatis maju sesuai siklus tagihannya (mis. +1 bulan untuk Bulanan, +1 tahun untuk Tahunan) dari \"Tgl Berakhir\" yang LAMA — bukan dari tanggal bayar hari ini. \"Terakhir Dibayar\" tetap terisi tanggal pembayaran ini, tapi cuma sebagai catatan, bukan acuan renewal.",
      "Sama seperti Domain: kalau pembayarannya telat, siklus jatuh tempo berikutnya TIDAK ikut mundur — tetap dihitung dari \"Tgl Berakhir\" lama, supaya telat bayar sekali tidak menggeser semua jadwal renewal berikutnya.",
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
    description: "Setelah disetujui, \"Tgl Berakhir\" server-nya otomatis maju sesuai siklus tagihan dari \"Tgl Berakhir\" lama, dan pengeluarannya resmi masuk laporan keuangan.",
  },
];

export const serverCaveats: string[] = [
  "Tombol \"Tagih Sekarang\" sekarang otomatis mengaitkan tagihannya ke server yang dimaksud, jadi pas dibayar, opsi \"Bayar Server\" sudah otomatis kepilih. TAPI kalau tagihannya dibuat manual (bukan lewat \"Tagih Sekarang\"), staf tetap wajib pilih sendiri server-nya pas input pembayaran — kalau lupa, \"Tgl Berakhir\" server-nya tidak akan berubah walau tagihannya sudah lunas.",
  "Tagihan dan pembayaran yang masih berstatus \"Draft\" belum dihitung di mana pun (Dashboard, laporan keuangan, saldo kas) — wajib disetujui (\"Posting\") dulu satu-satu, tagihannya dulu baru pembayarannya.",
  "\"Terakhir Dibayar\" dan \"Tgl Berakhir\" itu dua hal yang beda, sama seperti Domain: Terakhir Dibayar cuma catatan kapan terakhir kali transfer; Tgl Berakhir itu yang menentukan kapan server-nya harus diperpanjang dan yang dipakai buat memunculkan peringatan di Dashboard. Begitu dibayar, yang dimajukan ke siklus berikutnya adalah Tgl Berakhir (dari nilai lamanya), BUKAN dihitung ulang dari tanggal bayar — jadi telat bayar sekali tidak menggeser seluruh jadwal renewal berikutnya.",
  "Server yang belum pernah kesetel \"Tgl Berakhir\"-nya (server lama sebelum kolom ini ada) tetap jalan normal — sistem otomatis pakai \"Terakhir Dibayar\" + siklus tagihan sebagai perkiraan sementara, sampai staf isi manual \"Tgl Berakhir\"-nya atau server itu dibayar sekali (otomatis kesetel setelah itu).",
  "Server BISA didaftarkan baru langsung dari Master Data (tombol \"Tambah Server\") — beda dengan Domain yang cuma bisa diedit, tidak bisa ditambah dari halaman itu.",
]
