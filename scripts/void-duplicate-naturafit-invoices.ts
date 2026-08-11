/**
 * Perbaikan sekali-jalan: 3 invoice "Perpanjangan domain naturafit.id" ternyata duplikat satu
 * kejadian yang sama (INV/2026/00018, 00019, 00095) — direview manual bareng owner via chat.
 *
 * Yang di-keep: INV/2026/00018 (real, sudah dibayar dengan HPP asli 255rb).
 * Yang dibatalkan (void, bukan delete — biar jejak audit & jurnal tetap ada):
 *  - INV/2026/00019: duplikat test ("Perpanjangan domain naturafit.id (test SLA)"), sudah ada
 *    payment posted (HPP 0) yang harus dibatalkan dulu sebelum invoice-nya sendiri dibatalkan
 *    (mirror logic src/app/api/payments/[id]/void + src/app/api/invoices/[id]/void).
 *  - INV/2026/00095: hasil migrasi legacy piutang lama untuk kejadian renewal yang sama, belum
 *    ada payment sama sekali jadi tinggal void invoice-nya langsung.
 *
 * Aman dijalankan ulang: kalau invoice/payment sudah voided sebelumnya, di-skip (no-op).
 * Jalankan: npx tsx scripts/void-duplicate-naturafit-invoices.ts
 */
import { prisma } from "../src/lib/prisma"

const VOIDED_BY_ID = "eb05b85f-131a-476c-ad52-ac95adb9b04b" // Ony (owner) — yang minta pembatalan ini
const VOID_REASON = "Duplikat invoice perpanjangan domain naturafit.id (dikonfirmasi owner via chat)"

/** Mirror src/app/api/payments/[id]/route.ts DELETE — draft payment (belum posted, belum
 *  pernah menyentuh saldo/jurnal apa pun) di-hapus total, bukan void. */
async function deleteDraftPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { invoicePayments: true } })
  if (!payment) throw new Error(`Payment ${paymentId} tidak ditemukan`)
  if (payment.postStatus !== "draft") {
    console.log(`[delete] Payment ${payment.paymentNumber} bukan draft (${payment.postStatus}), skip.`)
    return
  }

  await prisma.$transaction(async (tx) => {
    const transactions = await tx.transaction.findMany({ where: { paymentId } })
    for (const t of transactions) {
      if (t.journalEntryId) {
        await tx.journalEntry.deleteMany({ where: { id: t.journalEntryId, postStatus: "draft" } })
      } else {
        const sourceType = t.refType ?? "invoice_payment"
        const sourceId = t.refType && t.refId ? t.refId : t.id
        await tx.journalEntry.deleteMany({ where: { sourceType, sourceId, postStatus: "draft" } })
      }
    }
    await tx.invoicePayment.deleteMany({ where: { paymentId } })
    await tx.transaction.deleteMany({ where: { paymentId } })
    await tx.payment.delete({ where: { id: paymentId } })
  })

  console.log(`[delete] Payment draft ${payment.paymentNumber} (beserta transaction & jurnal draft-nya) dihapus.`)
}

async function voidInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new Error(`Invoice ${invoiceId} tidak ditemukan`)
  if (invoice.postStatus !== "posted") {
    console.log(`[void] Invoice ${invoice.invoiceNumber} sudah ${invoice.postStatus}, skip.`)
    return
  }

  const hasPostedPayment = await prisma.invoicePayment.findFirst({
    where: { invoiceId, OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] },
  })
  if (hasPostedPayment) {
    throw new Error(`Invoice ${invoice.invoiceNumber} masih ada payment posted — batalkan dulu payment-nya`)
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { postStatus: "voided", voidedAt: new Date(), voidedById: VOIDED_BY_ID, voidReason: VOID_REASON },
  })
  console.log(`[void] Invoice ${invoice.invoiceNumber} dibatalkan.`)
}

async function main() {
  // INV/2026/00019 — payment-nya ternyata masih draft (belum posted, belum sentuh kas/jurnal
  // manapun), jadi dihapus total (bukan void) mengikuti pola DELETE /api/payments/[id].
  await deleteDraftPayment("f839c07d-a4c5-4494-a256-efd313613560")
  await voidInvoice("6cd96579-278f-4712-80ac-3770e1bcddca") // INV/2026/00019

  // INV/2026/00095 — tidak ada payment, langsung void invoice-nya
  await voidInvoice("e55782da-0a72-48fc-a38d-040caf46063a") // INV/2026/00095

  console.log("[void] Selesai. INV/2026/00018 dibiarkan aktif sebagai satu-satunya invoice sah.")
}

main()
  .catch((e) => {
    console.error("[void] Gagal:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
