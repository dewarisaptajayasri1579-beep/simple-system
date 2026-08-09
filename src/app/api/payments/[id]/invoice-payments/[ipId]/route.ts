import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeSplit } from "@/lib/split"

/** Ganti "Dibayar" 1 baris invoice di Payment yang masih DRAFT — inline-edit di halaman
 *  detail, tanpa perlu hapus+input ulang seluruh kwitansi. Recompute HPP proporsional +
 *  split (pakai persentase yang SUDAH terkunci di Transaction sejak dibuat, bukan settings
 *  terbaru — supaya kwitansi lama tidak ikut geser kalau persentase split berubah belakangan),
 *  sinkronkan 2 baris jurnal draft (kas & piutang), dan update ulang Payment.totalAmount. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; ipId: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id: paymentId, ipId } = await params
  const body = await request.json().catch(() => null)
  const amount = Number(body?.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Jumlah dibayar wajib diisi" }, { status: 400 })
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") {
    return NextResponse.json({ error: "Pembayaran yang sudah diposting/dibatalkan tidak bisa diubah" }, { status: 400 })
  }

  const invoicePayment = await prisma.invoicePayment.findUnique({
    where: { id: ipId },
    include: { invoice: { include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } } }, transaction: true },
  })
  if (!invoicePayment || invoicePayment.paymentId !== paymentId) {
    return NextResponse.json({ error: "Baris invoice tidak ditemukan" }, { status: 404 })
  }

  // Sisa tagihan cuma dihitung dari payment lain yang sudah posted (draft, termasuk baris ini
  // sendiri, belum dianggap piutang resmi) — persis logika di POST /api/payments.
  const alreadyPaid = invoicePayment.invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = invoicePayment.invoice.totalAmount - alreadyPaid
  if (amount > remaining + 0.5) {
    return NextResponse.json({ error: `Jumlah bayar melebihi sisa tagihan (sisa: ${remaining})` }, { status: 400 })
  }

  const rawPortion =
    invoicePayment.invoice.totalAmount > 0
      ? ((invoicePayment.invoice.totalCost + invoicePayment.invoice.ppnAmount) * amount) / invoicePayment.invoice.totalAmount
      : 0
  const nonRevenuePortion = Math.round(rawPortion) + Math.round(invoicePayment.costAmount)

  const result = await prisma.$transaction(async (tx) => {
    if (invoicePayment.transactionId) {
      const transaction = await tx.transaction.findUnique({ where: { id: invoicePayment.transactionId } })
      if (transaction) {
        const split = computeSplit(amount, nonRevenuePortion, {
          operasionalPct: transaction.splitOperasionalPct ?? 0,
          direksiPct: transaction.splitDireksiPct ?? 0,
          bonusPct: transaction.splitBonusPct ?? 0,
        })
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            grossAmount: amount,
            cost: nonRevenuePortion,
            netAmount: split.netAmount,
            operasionalAmount: split.operasionalAmount,
            direksiAmount: split.direksiAmount,
            bonusAmount: split.bonusAmount,
          },
        })

        if (transaction.journalEntryId) {
          const entry = await tx.journalEntry.findUnique({ where: { id: transaction.journalEntryId } })
          if (entry?.postStatus === "draft") {
            await tx.journalLine.updateMany({ where: { journalEntryId: entry.id, debit: { gt: 0 } }, data: { debit: amount } })
            await tx.journalLine.updateMany({ where: { journalEntryId: entry.id, credit: { gt: 0 } }, data: { credit: amount } })
          }
        }
      }
    }

    const updatedIp = await tx.invoicePayment.update({ where: { id: ipId }, data: { amount } })

    const lines = await tx.invoicePayment.findMany({ where: { paymentId } })
    const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0)
    await tx.payment.update({ where: { id: paymentId }, data: { totalAmount } })

    return updatedIp
  })

  return NextResponse.json(result)
}
