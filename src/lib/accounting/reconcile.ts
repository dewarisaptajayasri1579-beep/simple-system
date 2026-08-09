import type { TxClient } from "./post-journal"
import { postJournalEntry, voidJournalEntryBySource } from "./post-journal"
import { invoiceCostLines, invoiceRevenueLines, invoicePaymentLines } from "./journal-rules"
import { COA_CODE } from "./coa-seed"
import { getAccountCoaCode } from "./coa-lookup"

export interface ReconcileSummary {
  costFixed: boolean
  revenueCreated: boolean
  paymentsFixed: number
}

/** Perbaiki jurnal akrual 1 invoice supaya sesuai aturan baru (Piutang/Pendapatan diakui saat
 *  invoice terbit, HPP langsung ke Kas & Bank bukan "Hutang Usaha Vendor") — dipakai untuk
 *  invoice yang dibuat SEBELUM aturan ini berlaku. Idempotent: aman dipanggil berkali-kali,
 *  invoice yang jurnalnya sudah benar tidak disentuh (summary-nya semua false/0). Dipanggil per
 *  invoice di dalam prisma.$transaction sendiri-sendiri oleh POST /api/akuntansi/rekalkulasi. */
export async function reconcileInvoiceJournals(tx: TxClient, invoiceId: string, actorId: string): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { costFixed: false, revenueCreated: false, paymentsFixed: 0 }

  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  })
  if (!invoice || invoice.postStatus === "voided") return summary

  const hutangVendorAccount = await tx.chartOfAccount.findUnique({ where: { code: COA_CODE.hutangUsahaVendor } })

  // 1. HPP: kalau masih mengkredit "Hutang Usaha Vendor" (aturan lama), perbaiki jadi Kas & Bank.
  const costEntry = await tx.journalEntry.findFirst({
    where: { sourceType: "invoice", sourceId: invoice.id, postStatus: { not: "voided" } },
    include: { lines: true },
  })
  if (costEntry && hutangVendorAccount && costEntry.lines.some((l) => l.accountId === hutangVendorAccount.id)) {
    if (costEntry.postStatus === "draft") {
      const kasBankAccount = await tx.chartOfAccount.findUnique({ where: { code: COA_CODE.kasBankParent } })
      if (kasBankAccount) {
        await tx.journalLine.updateMany({
          where: { journalEntryId: costEntry.id, accountId: hutangVendorAccount.id },
          data: { accountId: kasBankAccount.id, memo: "HPP dibayar langsung" },
        })
        summary.costFixed = true
      }
    } else if (costEntry.postStatus === "posted") {
      await voidJournalEntryBySource(tx, { sourceType: "invoice", sourceId: invoice.id, voidedById: actorId, voidReason: "Rekalkulasi: HPP dipindah dari Hutang Vendor ke Kas & Bank" })
      await postJournalEntry(tx, {
        date: invoice.issuedAt,
        description: `Invoice ${invoice.invoiceNumber} (rekalkulasi HPP)`,
        sourceType: "invoice",
        sourceId: invoice.id,
        postStatus: "posted",
        createdBy: actorId,
        lines: invoiceCostLines({ totalCost: invoice.totalCost }),
      })
      summary.costFixed = true
    }
  }

  // 2. Pendapatan/Piutang: buat kalau belum pernah ada (invoice lama, dari sebelum fitur ini).
  const revenueEntry = await tx.journalEntry.findFirst({
    where: { sourceType: "invoice_revenue", sourceId: invoice.id, postStatus: { not: "voided" } },
  })
  if (!revenueEntry && invoice.totalAmount > 0) {
    await postJournalEntry(tx, {
      date: invoice.issuedAt,
      description: `Invoice ${invoice.invoiceNumber} (rekalkulasi pendapatan)`,
      sourceType: "invoice_revenue",
      sourceId: invoice.id,
      postStatus: invoice.postStatus === "posted" ? "posted" : "draft",
      createdBy: actorId,
      lines: invoiceRevenueLines({ totalAmount: invoice.totalAmount, ppnAmount: invoice.ppnAmount, revenueCoaCode: invoice.revenueCoaCode ?? undefined }),
    })
    summary.revenueCreated = true
  }

  // 3. Pelunasan: kalau jurnalnya masih mengkredit akun revenue (aturan lama), ganti jadi murni
  //    pelunasan Piutang Usaha.
  for (const ip of invoice.payments) {
    const transactionId = ip.transactionId
    if (!transactionId) continue
    const paymentEntry = await tx.journalEntry.findFirst({
      where: { sourceType: "invoice_payment", sourceId: transactionId, postStatus: { not: "voided" } },
      include: { lines: { include: { account: true } } },
    })
    if (!paymentEntry) continue
    const isOldStyle = paymentEntry.lines.some((l) => l.account.type === "revenue" || l.account.code === COA_CODE.ppnKeluaran)
    if (!isOldStyle) continue

    const kasBankCoaCode = await getAccountCoaCode(tx, ip.accountId)
    const newLines = invoicePaymentLines({ kasBankCoaCode, amount: ip.amount })

    if (paymentEntry.postStatus === "draft") {
      await tx.journalLine.deleteMany({ where: { journalEntryId: paymentEntry.id } })
      const accounts = await tx.chartOfAccount.findMany({ where: { code: { in: newLines.map((l) => l.accountCode!) } } })
      const byCode = new Map(accounts.map((a) => [a.code, a.id]))
      await tx.journalLine.createMany({
        data: newLines.map((l) => ({
          journalEntryId: paymentEntry.id,
          accountId: byCode.get(l.accountCode!)!,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
          memo: l.memo ?? null,
        })),
      })
    } else if (paymentEntry.postStatus === "posted") {
      await voidJournalEntryBySource(tx, { sourceType: "invoice_payment", sourceId: transactionId, voidedById: actorId, voidReason: "Rekalkulasi: pelunasan tidak lagi mengakui pendapatan/PPN" })
      await postJournalEntry(tx, {
        date: ip.paidAt,
        description: `Pelunasan invoice ${invoice.invoiceNumber} (rekalkulasi)`,
        sourceType: "invoice_payment",
        sourceId: transactionId,
        postStatus: "posted",
        createdBy: actorId,
        lines: newLines,
      })
    }
    summary.paymentsFixed += 1
  }

  return summary
}
