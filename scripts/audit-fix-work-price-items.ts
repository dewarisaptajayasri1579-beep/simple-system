/**
 * Audit fairness Acuan Level (dijalankan sekali, 2026-10-13):
 * 1. Isi 5 item yang masih Rp0 (belum pernah ditentukan di pricelist asli) — angka ikut pola
 *    kenaikan linear tiap kategori, dikonfirmasi Owner.
 * 2. Tulis ulang SEMUA keterangan jadi kriteria terukur (jumlah tabel/field/approval), bukan
 *    deskripsi samar — supaya penilaian level konsisten siapa pun yang menilai (termasuk AI).
 *
 * Idempoten by (groupName, level) — aman dijalankan ulang, selalu menimpa ke nilai final ini.
 * Kalau nanti harga/keterangan diedit manual dari UI Acuan Level, JANGAN jalankan ulang script
 * ini — dia akan menimpa balik ke nilai di sini.
 *
 * Jalankan: npx tsx scripts/audit-fix-work-price-items.ts
 */
import { prisma } from "@/lib/prisma"

interface Fix {
  groupName: string
  level: string | null
  label?: string
  price?: number
  description: string
}

const FIXES: Fix[] = [
  { groupName: "Master Data", level: "LEV-1", description: "Maks 1 tabel, field dasar (teks/angka/tanggal) tanpa relasi ke tabel lain. Contoh: Customer (nama, alamat, telp)." },
  { groupName: "Master Data", level: "LEV-2", description: "1 tabel + relasi ke 1-2 tabel lain (dropdown/lookup), ATAU ada validasi kode unik otomatis. Contoh: Produk dengan kategori & satuan dari tabel lain." },
  { groupName: "Master Data", level: "LEV-3", description: "Relasi ke 3+ tabel, ATAU ada hierarki/multi-level (parent-child), ATAU wajib approval sebelum data aktif, ATAU validasi silang antar beberapa tabel." },

  { groupName: "Transaksi", level: "LEV-1", description: "1 tabel header saja, input langsung tanpa hitung ulang stok/saldo, tanpa approval. Contoh: catat kas masuk harian." },
  { groupName: "Transaksi", level: "LEV-2", description: "Header + detail (1 tabel item/baris), update stok/saldo otomatis saat disimpan. Contoh: Penjualan dengan daftar barang." },
  { groupName: "Transaksi", level: "LEV-3", description: "Header + detail + status/approval berjenjang (draft -> approve -> posting), ATAU terhubung ke 1 dokumen lain (mis. PO jadi dasar Terima Barang)." },
  { groupName: "Transaksi", level: "LEV-4", price: 1187500, description: "Header + detail + approval berjenjang + terhubung ke 2 atau lebih dokumen lain (mis. PO -> Terima Barang -> Invoice), ATAU melibatkan 2 modul sekaligus (mis. stok & keuangan)." },
  { groupName: "Transaksi", level: "LEV-5", price: 1425000, description: "Transaksi lintas banyak modul dengan kalkulasi kompleks (mis. alokasi biaya, multi-gudang, multi-currency) dan approval berjenjang." },

  { groupName: "Laporan", level: "LEV-1", description: "1 sumber data (1 tabel/1 query), tanpa filter atau cuma filter tanggal sederhana." },
  { groupName: "Laporan", level: "LEV-2", description: "2 filter atau lebih (mis. tanggal + kategori/status) dan agregasi SUM/COUNT/GROUP BY dari 2 tabel atau lebih." },
  { groupName: "Laporan", level: "LEV-3", description: "3 filter atau lebih, ATAU perbandingan antar periode (mis. bulan ini vs bulan lalu), ATAU breakdown berlapis (drill-down kategori ke sub-kategori)." },

  { groupName: "Chart/Tabel", level: "LEV-1", description: "1 chart/tabel dari 1 sumber data, tanpa filter." },
  { groupName: "Chart/Tabel", level: "LEV-2", description: "1 chart/tabel dengan 1-2 filter, ATAU menggabungkan 2 sumber data." },
  { groupName: "Chart/Tabel", level: "LEV-3", description: "Chart/tabel dengan 3 filter atau lebih, ATAU drill-down, ATAU membandingkan 2 metrik/series atau lebih sekaligus." },

  { groupName: "Update Kolom", level: null, price: 95000, description: "Tambah/ubah/hapus 1 kolom pada tabel yang sudah ada, tanpa logic/validasi tambahan dan tanpa ubah tampilan form." },

  { groupName: "Mandatory", level: "LEV-1", description: "1 field wajib diisi, ATAU validasi format sederhana (mis. nomor HP, email) pada 1 field." },
  { groupName: "Mandatory", level: "LEV-2", description: "2-3 field saling bergantung (mis. wajib isi A kalau B dipilih), ATAU cek duplikat terhadap 1 tabel." },
  { groupName: "Mandatory", level: "LEV-3", price: 285000, description: "Validasi lintas 2 tabel/modul atau lebih (mis. stok tidak boleh minus berdasarkan transaksi gudang lain), ATAU validasi dengan banyak kondisi bersyarat." },

  { groupName: "Setup", level: null, label: "Setup Website", description: "Setup awal 1 aplikasi web: domain, hosting, SSL, deployment pertama kali sampai bisa diakses publik." },
  { groupName: "Setup", level: null, label: "Setup Android", description: "Setup awal 1 aplikasi Android: build, signing, upload ke Play Store/distribusi internal pertama kali." },

  { groupName: "Minor Update", level: "LEV-1", price: 47500, description: "Perubahan teks, warna, ukuran, atau urutan tampilan pada 1 halaman — tidak mengubah logic sama sekali." },
  { groupName: "Minor Update", level: "LEV-2", description: "Perubahan kecil pada logic/tampilan 1 halaman (mis. ubah rumus, ubah kondisi tampil/sembunyi), dampak tidak menyebar ke halaman lain." },
  { groupName: "Minor Update", level: "LEV-3", description: "Perubahan kecil yang menyentuh 2-3 halaman/komponen terkait (mis. ubah 1 field yang dipakai di beberapa tempat)." },

  { groupName: "Update Filter", level: null, description: "Menambah atau mengubah 1-2 filter pencarian pada halaman/laporan yang sudah ada, tanpa mengubah struktur tabel." },

  { groupName: "Mayor Update", level: "LEV-1", description: "Perubahan logic/alur signifikan pada 1 fitur, TIDAK menambah/mengubah struktur tabel (kolom/relasi tetap)." },
  { groupName: "Mayor Update", level: "LEV-2", description: "Perubahan logic signifikan + menambah/mengubah struktur tabel (kolom/relasi baru) pada fitur terkait." },
  { groupName: "Mayor Update", level: "LEV-3", description: "Perubahan besar berdampak ke 2 fitur/modul atau lebih sekaligus (mis. restrukturisasi alur transaksi yang dipakai beberapa laporan)." },
]

async function main() {
  let updated = 0
  let notFound = 0
  for (const fix of FIXES) {
    const existing = await prisma.workPriceItem.findFirst({
      where: { groupName: fix.groupName, level: fix.level, ...(fix.label ? { label: fix.label } : {}) },
    })
    if (!existing) {
      console.warn(`! Tidak ditemukan: ${fix.groupName} ${fix.level ?? fix.label ?? ""}`)
      notFound++
      continue
    }
    await prisma.workPriceItem.update({
      where: { id: existing.id },
      data: {
        description: fix.description,
        ...(fix.price !== undefined ? { price: fix.price } : {}),
      },
    })
    updated++
  }
  console.log(`~ ${updated} item diperbarui, ${notFound} tidak ditemukan`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
