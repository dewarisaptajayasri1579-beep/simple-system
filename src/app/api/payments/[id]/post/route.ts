import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { finalizeTransactionPosting } from "@/lib/accounting/mark-paid"

/** Posting Payment draft: semua Transaction yang dibuat bareng payment ini (pelunasan tiap
 *  invoice, plus costLink Bayar Domain/Server kalau ada) ikut diposting sekaligus, baru di
 *  titik ini piutang invoice-invoice terkait benar-benar berkurang & Invoice.status
 *  (unpaid/partial/paid) direcompute berdasarkan payment yang sudah posted. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { invoicePayments: { include: { invoice: { include: { payments: true } } } } },
  })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") return NextResponse.json({ error: "Pembayaran ini bukan draft (sudah diposting/dibatalkan)" }, { status: 400 })

  // Jaga-jaga: invoice-nya bisa saja sempat dibatalkan setelah draft payment ini dibuat.
  const voidedInvoice = payment.invoicePayments.find((ip) => ip.invoice.postStatus !== "posted")
  if (voidedInvoice) {
    return NextResponse.json(
      { error: `Invoice ${voidedInvoice.invoice.invoiceNumber} sudah tidak posted (dibatalkan) — tidak bisa posting pembayaran ini` },
      { status: 400 }
    )
  }

  const posted = await prisma.$transaction(async (tx) => {
    const draftTransactions = await tx.transaction.findMany({ where: { paymentId: id, postStatus: "draft" } })
    for (const t of draftTransactions) {
      await finalizeTransactionPosting(tx, { transactionId: t.id, postedById: user.id })
    }

    // Tandai payment lebih dulu agar query total pembayaran di bawah ikut menghitung
    // payment ini. Sebelumnya update ini dilakukan setelah perhitungan sehingga payment
    // yang baru diposting masih berstatus draft dan invoice keliru tetap "unpaid".
    const result = await tx.payment.update({
      where: { id },
      data: { postStatus: "posted", postedAt: new Date(), postedById: user.id },
      include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
    })

    // Recompute status tiap invoice yang dibayar payment ini, berdasarkan SEMUA payment yang
    // sudah posted (termasuk payment ini, yang baris Transaction-nya baru saja diposting di
    // atas) — payment lain yang masih draft tetap tidak ikut terhitung.
    for (const ip of payment.invoicePayments) {
      const postedPayments = await tx.invoicePayment.findMany({
        where: { invoiceId: ip.invoiceId, OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] },
      })
      const totalPaid = postedPayments.reduce((sum, p) => sum + p.amount, 0)
      const newStatus = totalPaid >= ip.invoice.totalAmount - 0.5 ? "paid" : totalPaid > 0 ? "partial" : "unpaid"
      await tx.invoice.update({ where: { id: ip.invoiceId }, data: { status: newStatus } })
    }

    return result
  })

  return NextResponse.json(posted)
}
