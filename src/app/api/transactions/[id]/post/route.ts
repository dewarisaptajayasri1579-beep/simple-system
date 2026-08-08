import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { finalizeTransactionPosting } from "@/lib/accounting/mark-paid"

/** Posting Transaction draft — dipakai untuk transaksi manual Keuangan (Input Pemasukan/
 *  Pengeluaran) dan hasil "Bayar Server"/"Bayar Domain"/"Tandai Lunas" Biaya Berkala. Transaksi
 *  yang jadi bagian dari Pembayaran (invoice_payment) di-posting lewat
 *  POST /api/payments/[id]/post, bukan lewat sini. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { invoicePayment: true } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  if (transaction.postStatus !== "draft") return NextResponse.json({ error: "Transaksi ini bukan draft (sudah diposting/dibatalkan)" }, { status: 400 })
  if (transaction.invoicePayment) {
    return NextResponse.json(
      { error: "Transaksi ini bagian dari Pembayaran — posting lewat menu Pembayaran, bukan di sini" },
      { status: 400 }
    )
  }

  const posted = await prisma.$transaction(async (tx) => finalizeTransactionPosting(tx, { transactionId: id, postedById: user.id }))

  return NextResponse.json(posted)
}
