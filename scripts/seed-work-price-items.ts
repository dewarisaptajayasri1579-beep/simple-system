/**
 * Seed master pricelist pekerjaan custom request client (sumber: pricelist.md, harga baru) +
 * keterangan kriteria tiap level (dasar acuan AI di menu "Hitung Harga" & tabel "Acuan Level").
 *
 * Idempoten: dicocokkan by (groupName, level, label) — tidak bikin duplikat kalau dijalankan
 * ulang. Harga yang sudah diubah dari UI/DB tetap TIDAK ditimpa; keterangan cuma dilengkapi
 * kalau kolomnya masih kosong (supaya hasil edit manual dari UI tidak ketimpa seed).
 *
 * Jalankan: npx tsx scripts/seed-work-price-items.ts
 */
import { prisma } from "@/lib/prisma"

interface SeedItem {
  groupName: string
  level: string | null
  label: string
  price: number
  description: string
}

const ITEMS: SeedItem[] = [
  { groupName: "Master Data", level: "LEV-1", label: "Master Data - LEV-1", price: 190000, description: "Tabel master sederhana, field dasar tanpa relasi ke tabel lain (mis. Customer: nama, alamat, telp)." },
  { groupName: "Master Data", level: "LEV-2", label: "Master Data - LEV-2", price: 285000, description: "Master data dengan relasi ke 1-2 tabel lain (dropdown referensi) atau validasi kode unik otomatis." },
  { groupName: "Master Data", level: "LEV-3", label: "Master Data - LEV-3", price: 475000, description: "Master data dengan relasi berlapis/multi-level, approval, atau validasi silang antar beberapa tabel." },
  { groupName: "Transaksi", level: "LEV-1", label: "Transaksi - LEV 1", price: 475000, description: "Transaksi sederhana: 1 tabel header, input langsung tanpa hitung ulang stok/saldo." },
  { groupName: "Transaksi", level: "LEV-2", label: "Transaksi - LEV 2", price: 712500, description: "Transaksi header-detail (ada tabel item/baris) dengan update stok/saldo otomatis." },
  { groupName: "Transaksi", level: "LEV-3", label: "Transaksi - LEV 3", price: 950000, description: "Transaksi dengan alur approval/status berjenjang atau keterkaitan ke multi dokumen (mis. PO -> Terima Barang)." },
  { groupName: "Transaksi", level: "LEV-4", label: "Transaksi - LEV 4", price: 0, description: "Belum ada acuan harga — transaksi sangat kompleks (lintas modul/entitas)." },
  { groupName: "Transaksi", level: "LEV-5", label: "Transaksi - LEV 5", price: 0, description: "Belum ada acuan harga — transaksi paling kompleks (integrasi eksternal/real-time)." },
  { groupName: "Laporan", level: "LEV-1", label: "Laporan - LEV 1", price: 380000, description: "Laporan tabel sederhana langsung dari 1 sumber data tanpa filter kompleks." },
  { groupName: "Laporan", level: "LEV-2", label: "Laporan - LEV 2", price: 712500, description: "Laporan dengan beberapa filter dan agregasi (SUM/COUNT/GROUP BY) dari beberapa tabel." },
  { groupName: "Laporan", level: "LEV-3", label: "Laporan - LEV 3", price: 855000, description: "Laporan kompleks: multi filter, perbandingan periode, atau breakdown berlapis." },
  { groupName: "Chart/Tabel", level: "LEV-1", label: "Chart/Tabel - LEVEL 1", price: 190000, description: "Satu chart/tabel sederhana dari 1 sumber data, tanpa filter." },
  { groupName: "Chart/Tabel", level: "LEV-2", label: "Chart/Tabel - LEVEL 2", price: 332500, description: "Chart/tabel dengan filter (tanggal/kategori) atau gabungan 2 sumber data." },
  { groupName: "Chart/Tabel", level: "LEV-3", label: "Chart/Tabel - LEVEL 3", price: 475000, description: "Chart/tabel kompleks: multi filter, drill-down, atau perbandingan beberapa metrik sekaligus." },
  { groupName: "Update Kolom", level: null, label: "Update Kolom", price: 0, description: "Tambah/ubah 1 kolom pada tabel yang sudah ada tanpa logic tambahan." },
  { groupName: "Mandatory", level: "LEV-1", label: "Mandatory - LEV 1", price: 95000, description: "Validasi wajib ringan: 1 field wajib diisi atau format sederhana (mis. nomor telepon)." },
  { groupName: "Mandatory", level: "LEV-2", label: "Mandatory - LEV 2", price: 190000, description: "Validasi wajib menengah: beberapa field saling bergantung atau cek duplikat." },
  { groupName: "Mandatory", level: "LEV-3", label: "Mandatory - LEV 3", price: 0, description: "Belum ada acuan harga — validasi wajib kompleks lintas tabel/modul." },
  { groupName: "Setup", level: null, label: "Setup Website", price: 950000, description: "Setup awal aplikasi berbasis web: domain, hosting, deployment pertama." },
  { groupName: "Setup", level: null, label: "Setup Android", price: 1425000, description: "Setup awal aplikasi Android: build, signing, publish/deploy pertama." },
  { groupName: "Minor Update", level: "LEV-1", label: "Minor Update - LEV 1", price: 0, description: "Perubahan sangat kecil: teks, warna, urutan tampilan — tanpa logic." },
  { groupName: "Minor Update", level: "LEV-2", label: "Minor Update - LEV 2", price: 95000, description: "Perubahan kecil pada logic/tampilan 1 halaman, dampak terbatas." },
  { groupName: "Minor Update", level: "LEV-3", label: "Minor Update - LEV 3", price: 142500, description: "Perubahan kecil tapi menyentuh lebih dari 1 halaman/komponen terkait." },
  { groupName: "Update Filter", level: null, label: "Update Filter", price: 190000, description: "Menambah/mengubah filter pencarian pada halaman/laporan yang sudah ada." },
  { groupName: "Mayor Update", level: "LEV-1", label: "Mayor Update - LEV 1", price: 285000, description: "Perubahan struktur/logic cukup signifikan pada 1 fitur, tidak mengubah tabel terkait." },
  { groupName: "Mayor Update", level: "LEV-2", label: "Mayor Update - LEV 2", price: 380000, description: "Perubahan struktur/logic signifikan yang menyentuh relasi/tabel terkait." },
  { groupName: "Mayor Update", level: "LEV-3", label: "Mayor Update - LEV 3", price: 475000, description: "Perubahan besar: restrukturisasi fitur yang berdampak ke beberapa modul sekaligus." },
]

async function main() {
  let added = 0
  let filled = 0
  let skipped = 0
  for (const [i, item] of ITEMS.entries()) {
    const existing = await prisma.workPriceItem.findFirst({
      where: { groupName: item.groupName, level: item.level, label: item.label },
    })
    if (!existing) {
      await prisma.workPriceItem.create({ data: { ...item, sortOrder: i + 1 } })
      added++
      continue
    }
    if (!existing.description) {
      await prisma.workPriceItem.update({ where: { id: existing.id }, data: { description: item.description } })
      filled++
    } else {
      skipped++
    }
  }
  console.log(`+ ${added} item baru, ~ ${filled} dilengkapi keterangan, = ${skipped} sudah lengkap (tidak ditimpa)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
