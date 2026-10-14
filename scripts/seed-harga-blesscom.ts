/**
 * Isi harga khusus client Blesscom, sumbernya hargablesscom.md (kolom "Harga Baru").
 *
 * Harga ini SUDAH JADI KESEPAKATAN dengan client, jadi sengaja disimpan di kolom sendiri
 * (`blesscomPrice`) — terpisah dari `price` yang merupakan turunan rubrik bobot dan ikut berubah
 * tiap kali rubrik dikalibrasi ulang.
 *
 * Level yang TIDAK ada di daftar ini (mis. Integrasi, Notifikasi, Multi-Cabang) sengaja
 * dibiarkan null supaya tidak ditawarkan di menu Pengajuan Pekerjaan Blesscom.
 *
 * Jalankan: npx tsx scripts/seed-harga-blesscom.ts
 */
import { prisma } from "@/lib/prisma"

/** [groupName, level, label (buat yang tanpa level), harga] — persis urutan hargablesscom.md. */
const HARGA: { groupName: string; level: string | null; label?: string; price: number }[] = [
  { groupName: "Master Data", level: "LEV-1", price: 190_000 },
  { groupName: "Master Data", level: "LEV-2", price: 285_000 },
  { groupName: "Master Data", level: "LEV-3", price: 475_000 },
  { groupName: "Transaksi", level: "LEV-1", price: 475_000 },
  { groupName: "Transaksi", level: "LEV-2", price: 712_500 },
  { groupName: "Transaksi", level: "LEV-3", price: 950_000 },
  { groupName: "Transaksi", level: "LEV-4", price: 0 },
  { groupName: "Transaksi", level: "LEV-5", price: 0 },
  { groupName: "Laporan", level: "LEV-1", price: 380_000 },
  { groupName: "Laporan", level: "LEV-2", price: 712_500 },
  { groupName: "Laporan", level: "LEV-3", price: 855_000 },
  { groupName: "Chart/Tabel", level: "LEV-1", price: 190_000 },
  { groupName: "Chart/Tabel", level: "LEV-2", price: 332_500 },
  { groupName: "Chart/Tabel", level: "LEV-3", price: 475_000 },
  { groupName: "Update Kolom", level: null, label: "Update Kolom", price: 0 },
  { groupName: "Mandatory", level: "LEV-1", price: 95_000 },
  { groupName: "Mandatory", level: "LEV-2", price: 190_000 },
  { groupName: "Mandatory", level: "LEV-3", price: 0 },
  { groupName: "Setup", level: null, label: "Setup Website", price: 950_000 },
  { groupName: "Setup", level: null, label: "Setup Android", price: 1_425_000 },
  { groupName: "Minor Update", level: "LEV-1", price: 0 },
  { groupName: "Minor Update", level: "LEV-2", price: 95_000 },
  { groupName: "Minor Update", level: "LEV-3", price: 142_500 },
  { groupName: "Update Filter", level: null, label: "Update Filter", price: 190_000 },
  { groupName: "Mayor Update", level: "LEV-1", price: 285_000 },
  { groupName: "Mayor Update", level: "LEV-2", price: 380_000 },
  { groupName: "Mayor Update", level: "LEV-3", price: 475_000 },
]

async function main() {
  let diisi = 0
  const tidakKetemu: string[] = []

  for (const h of HARGA) {
    const item = await prisma.workPriceItem.findFirst({
      where: { groupName: h.groupName, level: h.level, ...(h.label ? { label: h.label } : {}) },
      select: { id: true },
    })
    if (!item) {
      tidakKetemu.push(`${h.groupName} ${h.level ?? h.label}`)
      continue
    }
    await prisma.workPriceItem.update({ where: { id: item.id }, data: { blesscomPrice: h.price } })
    diisi++
  }

  // Level di luar daftar Blesscom dikosongkan supaya tidak ikut ditawarkan ke client Blesscom.
  const dikosongkan = await prisma.workPriceItem.updateMany({
    where: {
      blesscomPrice: { not: null },
      NOT: HARGA.map((h) => ({ groupName: h.groupName, level: h.level, ...(h.label ? { label: h.label } : {}) })),
    },
    data: { blesscomPrice: null },
  })

  console.log(`~ ${diisi} level Blesscom diisi harganya`)
  if (dikosongkan.count) console.log(`~ ${dikosongkan.count} level di luar daftar Blesscom dikosongkan`)
  if (tidakKetemu.length) console.warn(`! tidak ketemu di database: ${tidakKetemu.join(", ")}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
