# KB — Segmen Custom Application

Beda dari segmen lain: bukan satu industri, tapi **pembuatan aplikasi custom untuk kebutuhan apa pun**. Jadi "diagnosa cepat" di sini bukan soal industri, melainkan **cara mengkualifikasi proyek bespoke** — dan itu sudah banyak terekam dari roleplay Sesi 6–7 (`training-cika-log.md`, kasus distribusi sembako).

## Alur kualifikasi yang terbukti (dari Sesi 6–7)

Urutan gali yang dipakai, terlepas dari industrinya:
1. **Masalah** — apa yang dikeluhkan lead ("selisih stok, nota hilang").
2. **Dampak** — kenapa itu masalah ("piutang susah ditagih", "pusing tutup buku").
3. **Skala** — volume transaksi, jumlah tim/cabang. *(Manfaat sistemik: ini input untuk `LeadAiAnalysis` PROFILING → `buyingPower`/`companySize` → tier Kemampuan Beli, lihat `07-ai-agent-marketing.md` §2.2b.)*
4. **Alur kerja operasional** — proses harian yang berjalan sekarang (siapa mengerjakan apa, di mana).
5. **Menamai masalah dengan istilah tepat** — "multi satuan, multi harga" dari cerita "beras per karung vs eceran kiloan". Ini yang membangun kepercayaan paling kuat.

## Cerita klien

- **Klien parfum, sistem konsinyasi ke toko dengan sales keliling**: aplikasi mencatat stok gudang, stok yang dibawa sales, dan stok yang ada di toko — dari restok sampai penagihan. Dipakai sebagai bukti kemampuan untuk kasus serupa (distribusi dengan sales keliling/konsinyasi), disampaikan sebagai fakta masa lalu bukan janji (§2.2e).

## Ide solusi yang pernah terlontar (contoh gambaran, bukan janji baku)

- Untuk distribusi dengan toko + sales keliling: kombinasi **aplikasi kasir** (di toko) + **aplikasi mobile untuk sales** (input transaksi & tempo langsung dari lapangan, sistem bisa mengingatkan jatuh tempo).

## Istilah

*(belum digali)*

## Tanda bahaya (dikonfirmasi Ony: 1, 4, 5)

1. **Requirement terus berubah-ubah** — belum benar-benar tahu maunya apa sejak awal.
2. **Sudah gonta-ganti vendor sebelumnya** — riwayat proyek gagal berulang.
3. **Tidak melibatkan pengambil keputusan** — yang chat cuma staf, bukan pemilik/yang berwenang bayar.

*(dugaan "budget kecil tapi requirement besar" dan "minta dikerjakan sangat cepat" tidak dikonfirmasi — bukan berarti salah, cuma tidak masuk yang paling sering jadi alarm)*

## Batasan — hal yang tidak boleh dijanjikan Cika

- **Harga**: tidak pernah, di segmen mana pun (§2.2f) — tapi paling kritikal di Custom Application karena lingkupnya paling bervariasi.
- *(batasan lain khusus Custom App belum digali — mis. soal estimasi waktu pengerjaan, jaminan fitur tanpa breakdown requirement)*
