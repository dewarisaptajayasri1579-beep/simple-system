/**
 * Migrasi sekali-jalan: pindah pengakuan pendapatan dari accrual (diakui saat invoice terbit)
 * ke cash-basis (diakui saat uang benar-benar masuk). Kode journal-rules.ts sudah diubah
 * duluan untuk invoice BARU (lihat invoiceCostLines/invoicePaymentLines) — script ini cuma
 * mengoreksi invoice LAMA yang jurnal awalnya masih posting Piutang Usaha + Pendapatan Jasa
 * (+ PPN Keluaran) penuh di tanggal invoice terbit, padahal belum tentu (atau belum semua)
 * dibayar.
 *
 * PENTING: cuma menyentuh invoice yang MEMANG SUDAH PUNYA jurnal akrual (sourceType "invoice"
 * di JournalEntry) — invoice hasil migrasi legacy (dibuat langsung lewat script, bukan lewat
 * POST /api/invoices) tidak pernah posting jurnal apa pun, jadi tidak ada yang perlu dibalik.
 *
 * Untuk tiap invoice yang PUNYA SISA BELUM DIBAYAR, dibuat 1 jurnal koreksi per invoice:
 *   Debit Pendapatan Jasa   (porsi sisa yang belum diterima)
 *   Debit PPN Keluaran      (porsi sisa yang belum diterima, kalau ada)
 *   Kredit Piutang Usaha    (sisa belum dibayar)
 * Ini membalik pendapatan yang kepagian diakui untuk bagian yang belum ada uangnya, dan
 * menolkan saldo Piutang Usaha invoice itu (akun ini tidak dipakai lagi ke depan — piutang
 * sekarang cuma catatan di tabel Invoice/InvoicePayment, bukan akun GL). Saat nanti benar-benar
 * dibayar, /api/payments akan posting Pendapatan Jasa (+ PPN Keluaran) lagi lewat jalur normal.
 *
 * Invoice yang SUDAH LUNAS PENUH tidak disentuh — hasil akhirnya sudah sama persis dengan
 * model baru, cuma beda waktu pengakuan (bukan beda angka), jadi tidak perlu koreksi.
 *
 * Aman dijalankan ulang: invoice yang sudah punya jurnal koreksi (sourceType "correction",
 * sourceId = invoice.id) dilewati.
 *
 * Jalankan: npx tsx scripts/migrate-cash-basis-revenue.ts [--dry-run]
 */
import { prisma } from "../src/lib/prisma"
import { postJournalEntry } from "../src/lib/accounting/post-journal"
import { COA_CODE } from "../src/lib/accounting/coa-seed"

const dryRun = process.argv.includes("--dry-run")

async function main() {
  const invoices = await prisma.invoice.findMany({
    include: { payments: true, client: true },
    orderBy: { issuedAt: "asc" },
  })

  const invoiceIds = invoices.map((i) => i.id)
  const alreadyCorrected = await prisma.journalEntry.findMany({
    where: { sourceType: "correction", sourceId: { in: invoiceIds } },
    select: { sourceId: true },
  })
  const correctedIds = new Set(alreadyCorrected.map((e) => e.sourceId))

  const accrualJournaled = await prisma.journalEntry.findMany({
    where: { sourceType: "invoice", sourceId: { in: invoiceIds } },
    select: { sourceId: true },
  })
  const hasAccrualJournal = new Set(accrualJournaled.map((e) => e.sourceId))

  let corrected = 0
  let skippedFullyPaid = 0
  let skippedAlready = 0
  let skippedZero = 0
  let skippedNoAccrualJournal = 0

  for (const invoice of invoices) {
    if (correctedIds.has(invoice.id)) {
      skippedAlready++
      continue
    }
    if (!hasAccrualJournal.has(invoice.id)) {
      skippedNoAccrualJournal++
      continue
    }

    const paidToDate = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
    const unpaidAmount = Math.round((invoice.totalAmount - paidToDate) * 100) / 100

    if (unpaidAmount <= 0.5) {
      skippedFullyPaid++
      continue
    }
    if (invoice.totalAmount <= 0) {
      skippedZero++
      continue
    }

    const ppnPortion = Math.round((invoice.ppnAmount * unpaidAmount) / invoice.totalAmount)
    const pendapatanPortion = unpaidAmount - ppnPortion

    console.log(
      `[cash-basis] ${invoice.invoiceNumber} (${invoice.client.name}): sisa Rp${unpaidAmount.toLocaleString("id-ID")} ` +
        `-> koreksi Pendapatan Rp${pendapatanPortion.toLocaleString("id-ID")}, PPN Rp${ppnPortion.toLocaleString("id-ID")}`
    )

    if (dryRun) {
      corrected++
      continue
    }

    await prisma.$transaction(async (tx) => {
      const lines = [
        { accountCode: COA_CODE.pendapatanJasa, debit: pendapatanPortion, memo: "Koreksi cash-basis: pendapatan belum diterima" },
        ...(ppnPortion > 0
          ? [{ accountCode: COA_CODE.ppnKeluaran, debit: ppnPortion, memo: "Koreksi cash-basis: PPN belum diterima" }]
          : []),
        { accountCode: COA_CODE.piutangUsaha, credit: unpaidAmount, memo: "Koreksi cash-basis: piutang bukan lagi akun GL" },
      ]
      await postJournalEntry(tx, {
        date: new Date(),
        description: `Koreksi cash-basis - invoice ${invoice.invoiceNumber} (${invoice.client.name})`,
        sourceType: "correction",
        sourceId: invoice.id,
        lines,
      })
    })
    corrected++
  }

  console.log(
    `[cash-basis] Selesai${dryRun ? " (dry-run, tidak ada perubahan disimpan)" : ""}. ` +
      `Dikoreksi: ${corrected}, sudah lunas (dilewati): ${skippedFullyPaid}, sudah pernah dikoreksi (dilewati): ${skippedAlready}, ` +
      `tidak pernah punya jurnal akrual (dilewati): ${skippedNoAccrualJournal}, total 0 (dilewati): ${skippedZero}.`
  )
}

main()
  .catch((e) => {
    console.error("[cash-basis] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
