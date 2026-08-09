import type { TxClient } from "@/lib/accounting/post-journal"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { invoiceRevenueLines } from "@/lib/accounting/journal-rules"
import { generateInvoiceNumber } from "@/lib/invoice-number"
import { COA_CODE } from "@/lib/accounting/coa-seed"

/** Generate Invoice dari 1 baris ProjectPaymentSchedule (termin) — dipakai cron auto-invoice
 *  H-3 (src/lib/cron/project-termin-invoicing.ts) maupun tombol "Generate Invoice Sekarang" di
 *  detail Project. Idempotent: kalau schedule.invoiceId sudah terisi, tidak generate ulang.
 *
 *  Invoice-nya langsung `postStatus: posted` (bukan draft seperti invoice manual biasa) — supaya
 *  bisa langsung dibayar lewat menu Pembayaran, yang cuma menerima invoice posted. Tidak ada HPP
 *  di sini (termin project tidak melacak biaya modal). Jurnal akrual (Piutang/Pendapatan Project)
 *  langsung diposting `postStatus: posted` juga di sini (bukan draft->post terpisah seperti
 *  invoice manual), karena invoice-nya sendiri sudah langsung posted. */
export async function generateTerminInvoice(
  tx: TxClient,
  input: { scheduleId: string; createdBy: string | null }
) {
  const schedule = await tx.projectPaymentSchedule.findUnique({
    where: { id: input.scheduleId },
    include: { project: true },
  })
  if (!schedule) throw new Error("Jadwal pembayaran tidak ditemukan")
  if (schedule.invoiceId) return schedule

  const invoiceNumber = await generateInvoiceNumber()
  const description = `${schedule.project.name} - ${schedule.label}`

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber,
      clientId: schedule.project.clientId,
      subtotal: schedule.amount,
      totalAmount: schedule.amount,
      revenueCoaCode: COA_CODE.pendapatanProject,
      notes: description,
      postStatus: "posted",
      postedAt: new Date(),
      postedById: input.createdBy,
      lines: {
        create: [
          {
            description,
            qty: 1,
            unitPrice: schedule.amount,
            lineTotal: schedule.amount,
          },
        ],
      },
    },
  })

  await postJournalEntry(tx, {
    date: invoice.issuedAt,
    description: `Invoice ${invoice.invoiceNumber} - ${description}`,
    sourceType: "invoice_revenue",
    sourceId: invoice.id,
    createdBy: input.createdBy ?? undefined,
    postStatus: "posted",
    lines: invoiceRevenueLines({ totalAmount: schedule.amount, ppnAmount: 0, revenueCoaCode: COA_CODE.pendapatanProject }),
  })

  return tx.projectPaymentSchedule.update({
    where: { id: schedule.id },
    data: { invoiceId: invoice.id, invoiceGeneratedAt: new Date() },
  })
}
