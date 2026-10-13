/**
 * Seed master pricelist pekerjaan custom request client (sumber: pricelist.md, harga baru).
 *
 * Idempoten: dicocokkan by (groupName, level, label) — tidak bikin duplikat kalau dijalankan
 * ulang. Harga yang sudah diubah dari UI/DB tetap TIDAK ditimpa.
 *
 * Jalankan: npx tsx scripts/seed-work-price-items.ts
 */
import { prisma } from "@/lib/prisma"

interface SeedItem {
  groupName: string
  level: string | null
  label: string
  price: number
}

const ITEMS: SeedItem[] = [
  { groupName: "Master Data", level: "LEV-1", label: "Master Data - LEV-1", price: 190000 },
  { groupName: "Master Data", level: "LEV-2", label: "Master Data - LEV-2", price: 285000 },
  { groupName: "Master Data", level: "LEV-3", label: "Master Data - LEV-3", price: 475000 },
  { groupName: "Transaksi", level: "LEV-1", label: "Transaksi - LEV 1", price: 475000 },
  { groupName: "Transaksi", level: "LEV-2", label: "Transaksi - LEV 2", price: 712500 },
  { groupName: "Transaksi", level: "LEV-3", label: "Transaksi - LEV 3", price: 950000 },
  { groupName: "Transaksi", level: "LEV-4", label: "Transaksi - LEV 4", price: 0 },
  { groupName: "Transaksi", level: "LEV-5", label: "Transaksi - LEV 5", price: 0 },
  { groupName: "Laporan", level: "LEV-1", label: "Laporan - LEV 1", price: 380000 },
  { groupName: "Laporan", level: "LEV-2", label: "Laporan - LEV 2", price: 712500 },
  { groupName: "Laporan", level: "LEV-3", label: "Laporan - LEV 3", price: 855000 },
  { groupName: "Chart/Tabel", level: "LEV-1", label: "Chart/Tabel - LEVEL 1", price: 190000 },
  { groupName: "Chart/Tabel", level: "LEV-2", label: "Chart/Tabel - LEVEL 2", price: 332500 },
  { groupName: "Chart/Tabel", level: "LEV-3", label: "Chart/Tabel - LEVEL 3", price: 475000 },
  { groupName: "Update Kolom", level: null, label: "Update Kolom", price: 0 },
  { groupName: "Mandatory", level: "LEV-1", label: "Mandatory - LEV 1", price: 95000 },
  { groupName: "Mandatory", level: "LEV-2", label: "Mandatory - LEV 2", price: 190000 },
  { groupName: "Mandatory", level: "LEV-3", label: "Mandatory - LEV 3", price: 0 },
  { groupName: "Setup", level: null, label: "Setup Website", price: 950000 },
  { groupName: "Setup", level: null, label: "Setup Android", price: 1425000 },
  { groupName: "Minor Update", level: "LEV-1", label: "Minor Update - LEV 1", price: 0 },
  { groupName: "Minor Update", level: "LEV-2", label: "Minor Update - LEV 2", price: 95000 },
  { groupName: "Minor Update", level: "LEV-3", label: "Minor Update - LEV 3", price: 142500 },
  { groupName: "Update Filter", level: null, label: "Update Filter", price: 190000 },
  { groupName: "Mayor Update", level: "LEV-1", label: "Mayor Update - LEV 1", price: 285000 },
  { groupName: "Mayor Update", level: "LEV-2", label: "Mayor Update - LEV 2", price: 380000 },
  { groupName: "Mayor Update", level: "LEV-3", label: "Mayor Update - LEV 3", price: 475000 },
]

async function main() {
  let added = 0
  let skipped = 0
  for (const [i, item] of ITEMS.entries()) {
    const existing = await prisma.workPriceItem.findFirst({
      where: { groupName: item.groupName, level: item.level, label: item.label },
    })
    if (existing) {
      skipped++
      continue
    }
    await prisma.workPriceItem.create({ data: { ...item, sortOrder: i + 1 } })
    added++
  }
  console.log(`+ ${added} item baru, = ${skipped} sudah ada (tidak ditimpa)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
