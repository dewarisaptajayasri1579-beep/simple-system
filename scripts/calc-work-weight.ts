/**
 * Hitung bobot pekerjaan tiap item Acuan Level pakai rubrik 8 parameter universal, lalu
 * bandingkan harga hasil bobot dengan harga yang berlaku sekarang.
 *
 * Temuan yang mendasari: SEMUA harga di pricelist ini kelipatan Rp47.500, dan 1 "poin" =
 * Rp95.000 (harga lama Rp100.000 didiskon 5%). Jadi pricelist-nya memang sudah berbasis bobot
 * sejak awal — rubrik di bawah cuma mengeksplisitkan rumus dari pekerjaan ke poin, supaya
 * request yang kategorinya belum ada pun tetap bisa dihitung.
 *
 * Dry-run secara default (cuma menampilkan tabel perbandingan, TIDAK menulis ke database).
 * Tambahkan --apply untuk benar-benar menyimpan poin & harga hasil hitungan.
 *
 * Jalankan: npx tsx scripts/calc-work-weight.ts [--apply]
 */
import { prisma } from "@/lib/prisma"
import { POINT_VALUE_IDR, priceFromPoints, totalPoints, type WeightScores } from "@/lib/work-price/rubric"

type Scores = WeightScores

const BASE: Scores = { P1: "none", P2: "none", P3: "none", P4: "none", P5: "none", P6: "none", P7: "display", P8: "reuse" }

function s(partial: Partial<Scores>): Scores {
  return { ...BASE, ...partial }
}

/** Setup Website/Android sengaja TIDAK dihitung dari rubrik — itu paket kerja infrastruktur
 *  (domain, hosting, signing, publish), bukan pembuatan fitur, jadi harganya tetap seperti
 *  kesepakatan yang sudah jalan. */
const FIXED_PRICE_GROUPS = new Set(["Setup"])

const SCORES: { groupName: string; level: string | null; label?: string; scores: Scores }[] = [
  { groupName: "Master Data", level: "LEV-1", scores: s({ P1: "one", P2: "one", P7: "master" }) },
  { groupName: "Master Data", level: "LEV-2", scores: s({ P1: "one", P2: "few", P7: "master" }) },
  { groupName: "Master Data", level: "LEV-3", scores: s({ P1: "one", P2: "many", P4: "status", P7: "master" }) },

  { groupName: "Transaksi", level: "LEV-1", scores: s({ P1: "one", P2: "one", P3: "simple", P7: "money" }) },
  { groupName: "Transaksi", level: "LEV-2", scores: s({ P1: "one", P2: "few", P3: "simple", P6: "one", P7: "money" }) },
  { groupName: "Transaksi", level: "LEV-3", scores: s({ P1: "one", P2: "few", P3: "conditional", P4: "approval", P6: "one", P7: "money" }) },
  { groupName: "Transaksi", level: "LEV-4", scores: s({ P1: "few", P2: "many", P3: "conditional", P4: "approval", P6: "many", P7: "money" }) },
  { groupName: "Transaksi", level: "LEV-5", scores: s({ P1: "few", P2: "many", P3: "complex", P4: "approval", P6: "many", P7: "money" }) },

  { groupName: "Laporan", level: "LEV-1", scores: s({ P1: "one", P2: "one", P3: "simple" }) },
  { groupName: "Laporan", level: "LEV-2", scores: s({ P1: "one", P2: "few", P3: "conditional" }) },
  { groupName: "Laporan", level: "LEV-3", scores: s({ P1: "one", P2: "many", P3: "complex" }) },

  { groupName: "Chart/Tabel", level: "LEV-1", scores: s({ P1: "one", P2: "one", P3: "simple" }) },
  { groupName: "Chart/Tabel", level: "LEV-2", scores: s({ P1: "one", P2: "few", P3: "simple", P8: "adjust" }) },
  { groupName: "Chart/Tabel", level: "LEV-3", scores: s({ P1: "one", P2: "few", P3: "conditional", P8: "adjust" }) },

  { groupName: "Update Kolom", level: null, scores: s({ P2: "one" }) },

  { groupName: "Mandatory", level: "LEV-1", scores: s({ P3: "simple" }) },
  { groupName: "Mandatory", level: "LEV-2", scores: s({ P3: "conditional" }) },
  { groupName: "Mandatory", level: "LEV-3", scores: s({ P2: "few", P3: "conditional", P6: "one" }) },

  { groupName: "Minor Update", level: "LEV-1", scores: s({ P1: "one" }) },
  { groupName: "Minor Update", level: "LEV-2", scores: s({ P1: "one", P3: "simple" }) },
  { groupName: "Minor Update", level: "LEV-3", scores: s({ P1: "few", P6: "one" }) },

  { groupName: "Update Filter", level: null, scores: s({ P1: "one", P3: "simple", P6: "one" }) },

  { groupName: "Mayor Update", level: "LEV-1", scores: s({ P1: "one", P3: "conditional", P6: "one" }) },
  { groupName: "Mayor Update", level: "LEV-2", scores: s({ P1: "one", P2: "one", P3: "conditional", P6: "one" }) },
  { groupName: "Mayor Update", level: "LEV-3", scores: s({ P1: "few", P2: "one", P3: "conditional", P6: "many" }) },

  { groupName: "Integrasi", level: "LEV-1", scores: s({ P1: "one", P2: "one", P3: "simple", P5: "file" }) },
  { groupName: "Integrasi", level: "LEV-2", scores: s({ P1: "one", P2: "one", P3: "simple", P5: "oneway", P6: "one" }) },
  { groupName: "Integrasi", level: "LEV-3", scores: s({ P1: "one", P2: "few", P3: "conditional", P5: "twoway", P6: "one", P7: "money" }) },

  { groupName: "Cetak Dokumen", level: "LEV-1", scores: s({ P1: "one", P2: "one", P3: "simple", P5: "file" }) },
  { groupName: "Cetak Dokumen", level: "LEV-2", scores: s({ P1: "one", P2: "few", P3: "conditional", P5: "file", P8: "adjust" }) },
  { groupName: "Cetak Dokumen", level: "LEV-3", scores: s({ P1: "one", P2: "few", P3: "complex", P5: "file", P8: "adjust" }) },

  { groupName: "Notifikasi", level: "LEV-1", scores: s({ P3: "simple", P5: "file", P6: "one" }) },
  { groupName: "Notifikasi", level: "LEV-2", scores: s({ P3: "conditional", P5: "file", P6: "one" }) },
  { groupName: "Notifikasi", level: "LEV-3", scores: s({ P2: "one", P3: "complex", P5: "oneway", P6: "one" }) },

  { groupName: "Hak Akses", level: "LEV-1", scores: s({ P2: "one", P3: "simple", P6: "one" }) },
  { groupName: "Hak Akses", level: "LEV-2", scores: s({ P1: "one", P2: "one", P3: "conditional", P6: "one" }) },
  { groupName: "Hak Akses", level: "LEV-3", scores: s({ P1: "one", P2: "few", P3: "complex", P6: "many" }) },

  { groupName: "Migrasi Data", level: "LEV-1", scores: s({ P2: "one", P3: "simple", P5: "file", P7: "master" }) },
  { groupName: "Migrasi Data", level: "LEV-2", scores: s({ P2: "few", P3: "conditional", P5: "file", P6: "one", P7: "master" }) },
  { groupName: "Migrasi Data", level: "LEV-3", scores: s({ P2: "many", P3: "complex", P5: "file", P6: "many", P7: "master" }) },

  { groupName: "Redesign UI/UX", level: "LEV-1", scores: s({ P1: "one", P6: "one", P8: "adjust" }) },
  { groupName: "Redesign UI/UX", level: "LEV-2", scores: s({ P1: "few", P6: "one", P8: "adjust" }) },
  { groupName: "Redesign UI/UX", level: "LEV-3", scores: s({ P1: "many", P3: "conditional", P6: "many", P8: "scratch" }) },

  { groupName: "Multi-Cabang", level: "LEV-1", scores: s({ P2: "many", P3: "conditional", P6: "many", P7: "master" }) },
  { groupName: "Multi-Cabang", level: "LEV-2", scores: s({ P2: "many", P3: "complex", P6: "many", P7: "money" }) },
  { groupName: "Multi-Cabang", level: "LEV-3", scores: s({ P1: "few", P2: "many", P3: "complex", P6: "many", P7: "money", P8: "adjust" }) },
]

const rupiah = (n: number) => new Intl.NumberFormat("id-ID").format(n)

async function main() {
  const apply = process.argv.includes("--apply")
  const items = await prisma.workPriceItem.findMany({ orderBy: { sortOrder: "asc" } })

  let totalOld = 0
  let totalNew = 0
  const rows: string[] = []
  const bigShifts: string[] = []

  for (const item of items) {
    const fixed = FIXED_PRICE_GROUPS.has(item.groupName)
    const found = SCORES.find((x) => x.groupName === item.groupName && x.level === item.level)

    if (fixed) {
      rows.push(`${(item.groupName + " " + (item.level ?? item.label)).padEnd(28)} ${String(item.price / POINT_VALUE_IDR).padStart(5)} poin  ${rupiah(item.price).padStart(10)}  (paket tetap)`)
      totalOld += item.price
      totalNew += item.price
      continue
    }

    if (!found) {
      rows.push(`${(item.groupName + " " + (item.level ?? item.label)).padEnd(28)} -- tidak ada skor --`)
      continue
    }

    const points = totalPoints(found.scores)
    const newPrice = priceFromPoints(points)
    const diffPct = item.price > 0 ? Math.round(((newPrice - item.price) / item.price) * 100) : 0
    const mark = Math.abs(diffPct) >= 30 ? " <<<" : ""

    totalOld += item.price
    totalNew += newPrice

    const line = `${(item.groupName + " " + (item.level ?? item.label)).padEnd(28)} ${String(points).padStart(5)} poin  ${rupiah(newPrice).padStart(10)}  (lama ${rupiah(item.price).padStart(9)}, ${diffPct >= 0 ? "+" : ""}${diffPct}%)${mark}`
    rows.push(line)
    if (Math.abs(diffPct) >= 30) bigShifts.push(line)

    if (apply) {
      await prisma.workPriceItem.update({
        where: { id: item.id },
        data: { price: newPrice, weightPoints: points, weightDetail: found.scores },
      })
    }
  }

  console.log(rows.join("\n"))
  console.log(`\nTOTAL semua item: ${rupiah(totalOld)} -> ${rupiah(totalNew)} (${Math.round(((totalNew - totalOld) / totalOld) * 100)}%)`)
  console.log(`\nBergeser >=30% (${bigShifts.length} item):`)
  console.log(bigShifts.join("\n") || "  (tidak ada)")
  console.log(apply ? "\n*** PERUBAHAN SUDAH DISIMPAN ***" : "\n(dry-run — belum ada yang disimpan; tambahkan --apply untuk menyimpan)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
