/**
 * Perbaikan sekali-jalan: BKM/2026/00001 — "Pelunasan invoice INV/2026/00200" Rp10.000.000 masuk
 * ke Kas Utama pada 6 Agu 2026, transaksinya posted dan InvoicePayment-nya ada, TAPI tidak punya
 * JournalEntry sama sekali (dibuat sebelum modul Buku Besar aktif; dia transaksi pertama di
 * sistem, nomor BKM/2026/00001).
 *
 * Selama saldo kas/bank dihitung dari sisi operasional (Transaction + AccountTransfer), uang ini
 * tetap kehitung. Setelah saldo kas/bank dibaca dari Buku Besar (lihat src/lib/account-balance.ts),
 * transaksi tanpa jurnal jadi HILANG dari saldo — Kas Utama akan tampil Rp0 padahal isinya
 * Rp16.526.668. Jadi jurnalnya dibuatkan di sini, memakai aturan yang sama persis dengan
 * pelunasan invoice normal (invoicePaymentLines di app/api/payments/route.ts): debit Kas Utama,
 * kredit Pendapatan (+ PPN Keluaran kalau invoice-nya ber-PPN, proporsional terhadap porsi yang
 * dibayar — cash basis, lihat aturan.txt).
 *
 * Aman dijalankan berulang: kalau jurnalnya sudah ada, script berhenti tanpa mengubah apa pun.
 *
 * Simulasi (default, tidak menulis apa pun): npx tsx scripts/backfill-missing-payment-journal.ts
 * Eksekusi beneran:                          npx tsx scripts/backfill-missing-payment-journal.ts --commit
 */
import { prisma } from "../src/lib/prisma"
import { postJournalEntry } from "../src/lib/accounting/post-journal"
import { invoicePaymentLines } from "../src/lib/accounting/journal-rules"
import { revenueCoaCodeForInvoice } from "../src/lib/accounting/coa-seed"

const COMMIT = process.argv.includes("--commit")
const TRANSACTION_NUMBER = "BKM/2026/00001"

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`

async function main() {
  const transaction = await prisma.transaction.findFirst({
    where: { transactionNumber: TRANSACTION_NUMBER },
    include: { account: { select: { name: true, coaAccount: { select: { code: true } } } }, invoicePayment: true },
  })
  if (!transaction) throw new Error(`Transaksi ${TRANSACTION_NUMBER} tidak ditemukan`)
  if (transaction.postStatus !== "posted") throw new Error(`Transaksi ${TRANSACTION_NUMBER} statusnya ${transaction.postStatus}, bukan posted`)
  if (!transaction.invoicePayment) throw new Error(`Transaksi ${TRANSACTION_NUMBER} bukan pelunasan invoice`)

  const existing =
    transaction.journalEntryId ??
    (await prisma.journalEntry.findFirst({ where: { sourceId: transaction.id }, select: { id: true } }))?.id
  if (existing) {
    console.log(`Sudah ada jurnal untuk ${TRANSACTION_NUMBER} — tidak ada yang perlu dikerjakan.`)
    return
  }

  const kasBankCoaCode = transaction.account.coaAccount?.code
  if (!kasBankCoaCode) throw new Error(`Akun ${transaction.account.name} belum punya akun COA`)

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: transaction.invoicePayment.invoiceId },
    select: { invoiceNumber: true, totalAmount: true, ppnAmount: true, ppnEnabled: true, revenueCoaCode: true, costLinkType: true, client: { select: { isPemungutPpn: true } } },
  })

  // Sama rumus dengan POST /api/payments: PPN diakui proporsional terhadap porsi yang dibayar,
  // sisanya Pendapatan. HPP sengaja 0 — biaya invoice ini tidak ada (cost = 0 di transaksinya).
  const amount = transaction.invoicePayment.amount
  const isPemungut = invoice.client.isPemungutPpn && invoice.ppnEnabled
  const ppnPortion = !isPemungut && invoice.totalAmount > 0 ? Math.round((invoice.ppnAmount * amount) / invoice.totalAmount) : 0
  const revenuePortion = amount - ppnPortion

  const lines = invoicePaymentLines({
    kasBankCoaCode,
    amount,
    revenueCoaCode: revenueCoaCodeForInvoice(invoice),
    revenueAmount: revenuePortion,
    ppnAmount: ppnPortion,
    hppAmount: 0,
  })

  console.log(`${TRANSACTION_NUMBER} · ${transaction.description}`)
  console.log(`  akun     : ${transaction.account.name} (${kasBankCoaCode})`)
  console.log(`  invoice  : ${invoice.invoiceNumber} · total ${rupiah(invoice.totalAmount)} · PPN ${rupiah(invoice.ppnAmount)} (pemungut: ${isPemungut ? "ya" : "tidak"})`)
  console.log(`  tanggal  : ${transaction.occurredAt.toISOString().slice(0, 10)}`)
  console.log("  baris jurnal:")
  for (const l of lines) {
    console.log(`    ${(l.accountCode ?? l.accountId ?? "").padEnd(10)} D ${rupiah(l.debit ?? 0).padStart(16)}  K ${rupiah(l.credit ?? 0).padStart(16)}  ${l.memo ?? ""}`)
  }

  if (!COMMIT) {
    console.log("\n(simulasi — tidak ada yang ditulis. Jalankan ulang dengan --commit untuk benar-benar membuat jurnalnya.)")
    return
  }

  await prisma.$transaction(async (tx) => {
    const entry = await postJournalEntry(tx, {
      date: transaction.occurredAt,
      description: transaction.description || `Pelunasan invoice ${invoice.invoiceNumber}`,
      sourceType: "invoice_payment",
      sourceId: transaction.id,
      postStatus: "posted",
      lines,
    })
    await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: entry.id } })
    console.log(`\nJurnal dibuat: ${entry.entryNumber}`)
  })
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
