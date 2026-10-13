/**
 * Tambah kategori yang belum ada di Acuan Level (audit 2026-10-13): integrasi, cetak dokumen,
 * notifikasi, hak akses, migrasi data, redesign UI/UX, multi-cabang — pekerjaan yang sering
 * muncul di request client custom tapi sebelumnya tidak ada kategorinya sama sekali.
 *
 * Harga dikalibrasi mengikuti skala level yang sudah ada (bandingkan ke Master Data/Transaksi/
 * Mandatory di harga yang setara kompleksitasnya), bukan hasil nego real — tetap bisa dikoreksi
 * lewat UI Acuan Level kalau ada kasus nyata yang membuktikan angkanya kurang pas.
 *
 * Idempoten by (groupName, level) — aman dijalankan ulang, tidak bikin duplikat atau menimpa
 * yang sudah ada.
 *
 * Jalankan: npx tsx scripts/add-work-price-categories.ts
 */
import { prisma } from "@/lib/prisma"

interface NewItem {
  groupName: string
  level: string | null
  label: string
  price: number
  description: string
}

const ITEMS: NewItem[] = [
  {
    groupName: "Integrasi",
    level: "LEV-1",
    label: "Integrasi - LEV 1",
    price: 285000,
    description: "Import/export data 1 arah, 1 format (mis. export laporan ke Excel, atau import master data dari CSV), tanpa validasi lintas sistem.",
  },
  {
    groupName: "Integrasi",
    level: "LEV-2",
    label: "Integrasi - LEV 2",
    price: 712500,
    description: "Integrasi API eksternal sederhana 1 endpoint (mis. kirim notifikasi WhatsApp, cek ongkir), request searah tanpa perlu nunggu callback.",
  },
  {
    groupName: "Integrasi",
    level: "LEV-3",
    label: "Integrasi - LEV 3",
    price: 1425000,
    description: "Integrasi kompleks: payment gateway atau API eksternal dengan callback/webhook, 2+ endpoint, perlu handle status async & retry.",
  },

  {
    groupName: "Cetak Dokumen",
    level: "LEV-1",
    label: "Cetak Dokumen - LEV 1",
    price: 285000,
    description: "Cetak PDF 1 halaman dengan template tetap, isi data langsung dari 1 tabel (mis. invoice sederhana).",
  },
  {
    groupName: "Cetak Dokumen",
    level: "LEV-2",
    label: "Cetak Dokumen - LEV 2",
    price: 475000,
    description: "Cetak PDF dengan layout dinamis — jumlah baris/halaman menyesuaikan data, atau gabungan data dari 2+ tabel.",
  },
  {
    groupName: "Cetak Dokumen",
    level: "LEV-3",
    label: "Cetak Dokumen - LEV 3",
    price: 712500,
    description: "Cetak dengan template custom per client/cabang (kop, logo, format beda-beda), atau gabungan beberapa dokumen jadi 1 file PDF.",
  },

  {
    groupName: "Notifikasi",
    level: "LEV-1",
    label: "Notifikasi - LEV 1",
    price: 190000,
    description: "Notifikasi 1 event, 1 channel (mis. WA/email) yang dikirim langsung saat user melakukan aksi tertentu — tanpa jadwal.",
  },
  {
    groupName: "Notifikasi",
    level: "LEV-2",
    label: "Notifikasi - LEV 2",
    price: 380000,
    description: "Notifikasi terjadwal (cron) untuk 1 kondisi, 1 channel (mis. reminder jatuh tempo tiap pagi).",
  },
  {
    groupName: "Notifikasi",
    level: "LEV-3",
    label: "Notifikasi - LEV 3",
    price: 712500,
    description: "Notifikasi multi-channel ATAU multi-kondisi dengan logic bertingkat (mis. eskalasi ke atasan kalau belum direspon dalam X hari).",
  },

  {
    groupName: "Hak Akses",
    level: "LEV-1",
    label: "Hak Akses - LEV 1",
    price: 190000,
    description: "Tambah 1 role baru yang aksesnya mengikuti pola role lain yang sudah ada (copy & sesuaikan sedikit).",
  },
  {
    groupName: "Hak Akses",
    level: "LEV-2",
    label: "Hak Akses - LEV 2",
    price: 380000,
    description: "Role baru dengan kombinasi akses custom per menu/halaman (bukan cuma copy role lain).",
  },
  {
    groupName: "Hak Akses",
    level: "LEV-3",
    label: "Hak Akses - LEV 3",
    price: 712500,
    description: "Sistem permission granular: akses dibatasi per baris data atau per field, bukan cuma per menu/halaman.",
  },

  {
    groupName: "Migrasi Data",
    level: "LEV-1",
    label: "Migrasi Data - LEV 1",
    price: 380000,
    description: "Migrasi 1 tabel dari sumber jelas & rapi (Excel/CSV dengan format sudah sesuai), tanpa perlu pembersihan data.",
  },
  {
    groupName: "Migrasi Data",
    level: "LEV-2",
    label: "Migrasi Data - LEV 2",
    price: 855000,
    description: "Migrasi 2+ tabel berelasi, perlu mapping kolom & pembersihan/normalisasi data sebelum masuk sistem baru.",
  },
  {
    groupName: "Migrasi Data",
    level: "LEV-3",
    label: "Migrasi Data - LEV 3",
    price: 1425000,
    description: "Migrasi dari sistem lama dengan struktur database berbeda total, perlu transformasi data kompleks & validasi hasil.",
  },

  {
    groupName: "Redesign UI/UX",
    level: "LEV-1",
    label: "Redesign UI/UX - LEV 1",
    price: 285000,
    description: "Redesign tampilan 1 halaman (layout/warna/komponen), tanpa mengubah alur kerja atau logic.",
  },
  {
    groupName: "Redesign UI/UX",
    level: "LEV-2",
    label: "Redesign UI/UX - LEV 2",
    price: 570000,
    description: "Redesign 2-3 halaman yang saling terkait, termasuk komponen yang dipakai bersama (mis. ubah pola semua form input).",
  },
  {
    groupName: "Redesign UI/UX",
    level: "LEV-3",
    label: "Redesign UI/UX - LEV 3",
    price: 1425000,
    description: "Redesign menyeluruh 1 modul: banyak halaman + perubahan alur kerja/navigasi, bukan cuma tampilan.",
  },

  {
    groupName: "Multi-Cabang",
    level: "LEV-1",
    label: "Multi-Cabang - LEV 1",
    price: 475000,
    description: "Tambah filter cabang pada data yang sudah ada — semua cabang masih bisa saling lihat data lewat filter, belum terisolasi.",
  },
  {
    groupName: "Multi-Cabang",
    level: "LEV-2",
    label: "Multi-Cabang - LEV 2",
    price: 950000,
    description: "Isolasi data penuh per cabang — tiap akun cabang cuma bisa lihat & input data cabangnya sendiri.",
  },
  {
    groupName: "Multi-Cabang",
    level: "LEV-3",
    label: "Multi-Cabang - LEV 3",
    price: 1900000,
    description: "Multi-tenant penuh: skema/branding beda per tenant (bukan cuma beda cabang dalam 1 perusahaan), termasuk setup awal tiap tenant baru.",
  },
]

async function main() {
  const last = await prisma.workPriceItem.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } })
  let nextSort = (last?.sortOrder ?? 0) + 1

  let added = 0
  let skipped = 0
  for (const item of ITEMS) {
    const existing = await prisma.workPriceItem.findFirst({ where: { groupName: item.groupName, level: item.level } })
    if (existing) {
      skipped++
      continue
    }
    await prisma.workPriceItem.create({ data: { ...item, sortOrder: nextSort } })
    nextSort++
    added++
  }
  console.log(`+ ${added} item baru, = ${skipped} sudah ada (dilewati)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
