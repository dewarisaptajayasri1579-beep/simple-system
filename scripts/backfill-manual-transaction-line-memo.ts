/**
 * Perbaikan sekali-jalan: JournalLine hasil Pengeluaran/Pemasukan manual (Kas Keluar/Bank Keluar
 * > Biaya Manual, Keuangan > Input Pemasukan/Pengeluaran) selama ini selalu diberi memo generik
 * "Pengeluaran manual"/"Pemasukan manual" di kedua baris jurnalnya (lihat manualExpenseLines/
 * manualIncomeLines di src/lib/accounting/journal-rules.ts, SUDAH DIPERBAIKI supaya baris baru
 * tidak lagi diisi memo generik itu). Karena Buku Besar nampilin `line.memo || journalEntry.
 * description` (lihat app/akuntansi/buku-besar/page.tsx), memo generik itu SELALU menang
 * ketimbang journalEntry.description — padahal description-nya sendiri sudah benar, diisi dari
 * keterangan asli yang diketik staf saat input (lihat caller-nya: `description: transaction.
 * description || "Pengeluaran manual"`).
 *
 * Perbaikannya cukup KOSONGKAN memo generik itu di baris-baris lama (bukan tulis ulang manual) —
 * begitu memo null, Buku Besar otomatis jatuh ke journalEntry.description yang sudah benar.
 *
 * Aman dijalankan ulang: kalau tidak ada lagi baris dengan memo generik itu, tidak melakukan apa-apa.
 * Jalankan: npx tsx scripts/backfill-manual-transaction-line-memo.ts
 */
import { prisma } from "../src/lib/prisma"

const GENERIC_MEMOS = ["Pengeluaran manual", "Pemasukan manual"]

async function main() {
  const affected = await prisma.journalLine.findMany({
    where: { memo: { in: GENERIC_MEMOS } },
    include: { journalEntry: { select: { entryNumber: true, description: true } } },
  })

  if (affected.length === 0) {
    console.log("[backfill] Tidak ada JournalLine dengan memo generik tersisa, tidak ada yang diubah.")
    return
  }

  for (const line of affected) {
    console.log(`[backfill] ${line.journalEntry.entryNumber}: "${line.memo}" -> "${line.journalEntry.description}"`)
  }

  const result = await prisma.journalLine.updateMany({
    where: { memo: { in: GENERIC_MEMOS } },
    data: { memo: null },
  })

  console.log(`[backfill] Selesai — ${result.count} baris jurnal dikosongkan memo-nya, sekarang jatuh ke keterangan asli.`)
}

main()
  .catch((e) => {
    console.error("[backfill] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
