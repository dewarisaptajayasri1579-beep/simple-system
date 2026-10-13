/**
 * Bandingkan model AI untuk Kalkulator Harga: apakah Haiku (3x lebih murah) menilai bobot
 * sekonsisten Sonnet?
 *
 * Diuji dua hal yang berbeda sifatnya:
 *   A. Konsistensi penilaian — deskripsi yang sudah lengkap, keduanya harus langsung menyimpulkan
 *      dengan poin yang sama. Ini yang menentukan harga, jadi selisih di sini = selisih rupiah.
 *   B. Mutu pertanyaan — deskripsi sengaja kabur, lihat apa yang ditanyakan dan pilihan yang
 *      ditawarkan. Pertanyaan yang salah sasaran bikin staf menjawab hal yang tidak menentukan harga.
 *
 * Jalankan: npx tsx scripts/compare-ai-model.ts
 */
import { prisma } from "@/lib/prisma"
import { continueWorkPriceChat } from "@/lib/work-price/ai-match"
import { PARAMETER_CODES } from "@/lib/work-price/rubric"

const MODELS = ["claude-sonnet-5", "claude-haiku-4-5"]

/** Deskripsi lengkap — keduanya harus bisa langsung menyimpulkan tanpa bertanya. */
const JELAS = [
  "Bikin master data supplier: nama, alamat, telepon saja. Tidak ada relasi ke tabel lain, tidak perlu approval, tampilannya ikut pola halaman master yang sudah ada.",
  "Fitur transaksi penjualan: ada nota header dan daftar barang per nota, stok otomatis berkurang saat disimpan, tanpa approval. Pakai pola tampilan yang sudah ada.",
  "Laporan stok per gudang, cuma filter bulan, dari satu sumber data, tanpa perbandingan periode dan tanpa breakdown kategori.",
  "Kirim notifikasi WhatsApp otomatis ke customer tiap invoice baru dibuat, langsung saat disimpan, tanpa jadwal. Integrasi WA-nya sudah ada di sistem.",
  "Tambah filter cabang di semua halaman transaksi yang sudah jalan, supaya data bisa disaring per cabang. Semua cabang masih boleh lihat data cabang lain.",
]

/** Deskripsi kabur — menguji apakah pertanyaan pertamanya menyasar parameter yang menentukan. */
const KABUR = [
  "Client minta dibikinin fitur approval.",
  "Tolong bikin laporan buat bos.",
]

const rupiah = (n: number) => new Intl.NumberFormat("id-ID").format(n)

async function main() {
  const catalog = await prisma.workPriceItem.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, groupName: true, level: true, label: true, description: true, price: true, weightPoints: true, weightDetail: true },
  })

  console.log("=".repeat(78))
  console.log("A. KONSISTENSI PENILAIAN (deskripsi lengkap — harusnya langsung simpulkan)")
  console.log("=".repeat(78))

  let selisihTotal = 0
  let adaSelisih = 0

  for (const [i, teks] of JELAS.entries()) {
    console.log(`\n[${i + 1}] ${teks.slice(0, 72)}...`)
    const hasil: Record<string, { poin: number; total: number; rincian: string }> = {}

    for (const model of MODELS) {
      try {
        const r = await continueWorkPriceChat([{ role: "user", text: teks }], catalog, 0, "internal", model)
        if (r.status === "tanya") {
          console.log(`    ${model.padEnd(18)} -> malah bertanya: "${r.pertanyaan.slice(0, 60)}..."`)
          continue
        }
        const rincian = r.pekerjaan
          .map((j) => `${j.nama.slice(0, 28)} [${PARAMETER_CODES.map((c) => j.scores[c]).join(",")}] ${j.poin}p`)
          .join(" | ")
        hasil[model] = { poin: r.totalPoin, total: r.total, rincian }
        console.log(`    ${model.padEnd(18)} -> ${String(r.totalPoin).padStart(5)} poin = Rp${rupiah(r.total).padStart(10)}  (${r.pekerjaan.length} pekerjaan)`)
        console.log(`    ${" ".repeat(18)}    ${rincian}`)
      } catch (e) {
        console.log(`    ${model.padEnd(18)} -> GAGAL: ${e instanceof Error ? e.message : e}`)
      }
    }

    const a = hasil[MODELS[0]]
    const b = hasil[MODELS[1]]
    if (a && b) {
      const beda = b.total - a.total
      const pct = a.total > 0 ? Math.round((beda / a.total) * 100) : 0
      selisihTotal += Math.abs(beda)
      if (beda !== 0) adaSelisih++
      console.log(`    SELISIH            -> ${beda >= 0 ? "+" : ""}Rp${rupiah(beda)} (${pct >= 0 ? "+" : ""}${pct}%)`)
    }
  }

  console.log("\n" + "=".repeat(78))
  console.log("B. MUTU PERTANYAAN (deskripsi kabur — pertanyaan harus menyasar yang menentukan harga)")
  console.log("=".repeat(78))

  for (const teks of KABUR) {
    console.log(`\n"${teks}"`)
    for (const model of MODELS) {
      try {
        const r = await continueWorkPriceChat([{ role: "user", text: teks }], catalog, 0, "internal", model)
        if (r.status !== "tanya") {
          console.log(`    ${model.padEnd(18)} -> langsung simpulkan (tidak bertanya): ${r.totalPoin} poin = Rp${rupiah(r.total)}`)
          continue
        }
        console.log(`    ${model.padEnd(18)} -> [${r.tipeJawaban}] ${r.pertanyaan}`)
        r.pilihan.forEach((p) => console.log(`    ${" ".repeat(18)}      - ${p}`))
      } catch (e) {
        console.log(`    ${model.padEnd(18)} -> GAGAL: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  console.log("\n" + "=".repeat(78))
  console.log(`RINGKAS: ${adaSelisih}/${JELAS.length} kasus berbeda harga; total selisih mutlak Rp${rupiah(selisihTotal)}`)
  console.log("=".repeat(78))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
