# Knowledge Base Marketing — bahan wawasan untuk Cika

Sumber pengetahuan produk & industri yang dipakai Cika saat melayani lead (lihat `docs/07-ai-agent-marketing.md` §2.6a). Isi dokumen di folder ini disisipkan ke system prompt sesuai `Lead.segment`.

## Dari mana isinya

Dari pengalaman 14 tahun Ony di bisnis ini. Pengetahuan seperti ini bersifat **tacit** — ada di kepala, tapi tidak bisa dipanggil dengan pertanyaan terbuka semacam "apa saja yang penting di industri X". Karena itu penggaliannya memakai cara yang sudah terbukti berhasil di `training-cika-log.md`:

1. **Sodorkan kasus konkret, bukan abstraksi.** Istilah "multi satuan, multi harga" muncul sendiri saat ada kasus nyata di depan mata — tidak akan pernah keluar dari pertanyaan langsung.
2. **Tebak dulu, minta dikoreksi.** Mengoreksi tebakan yang salah jauh lebih ringan daripada mengingat dari nol.
3. **Satu pertanyaan konkret per giliran.**
4. **Pakai kasus ekstrem** — klien paling sukses, proyek paling bermasalah. Yang ekstrem paling mudah diingat.

## Yang dibutuhkan per segmen

- **Diagnosa cepat** — masalah yang hampir selalu ada di industri itu, bahkan sebelum lead bercerita. Inilah yang membuat Cika terdengar paham (efek "multi satuan, multi harga").
- **Istilah yang tepat** — bahasa yang dipakai orang di industri itu.
- **Cerita klien** — kasus nyata yang pernah dikerjakan, untuk membuktikan kemampuan tanpa menjanjikan apa pun (§2.2e).
- **Tanda bahaya** — ciri lead yang biasanya berujung gagal/batal.
- **Batasan** — apa yang tidak boleh dijanjikan Cika.

> **Harga tidak masuk KB.** Cika tidak pernah menyebut angka (§2.2f), jadi tidak ada harga yang perlu dirawat di sini.

## Status pengisian

| Segmen | Diagnosa cepat | Istilah | Cerita klien | Tanda bahaya |
|---|---|---|---|---|
| Bengkel | — | — | — | — |
| SevenRent / Rental | — | — | — | — |
| Custom App / Distribusi | sebagian¹ | — | sebagian¹ | — |
| Bengkel | ✅ | di-skip² | sebagian³ | — |
| Gym | — | — | — | — |
| SAP | — | — | — | — |
| Absensi | — | — | — | — |

¹ Dari Sesi 6–7 di `training-cika-log.md`: multi satuan/multi harga, stok di sales keliling, piutang tempo, dan cerita klien parfum konsinyasi.
² Ony sempat konfirmasi "Antrian Stall" lalu membatalkannya (keliru) — dilewati dulu, digali ulang nanti.
³ Bukan cerita klien "sebelum-sesudah", tapi ide solusi konkret (QR code CS di invoice) dari Sesi 8.
