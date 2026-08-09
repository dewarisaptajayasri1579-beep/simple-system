import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
  })

  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  return NextResponse.json(payment)
}

/** Hapus Payment DRAFT (belum diposting) — dipakai untuk "edit": hapus draft, input ulang
 *  lewat form Pelunasan. Ikut menghapus InvoicePayment, Transaction, dan jurnal draft terkait
 *  (termasuk costLink Bayar Domain/Server yang dikaitkan ke payment ini, kalau ada). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const payment = await prisma.payment.findUnique({ where: { id }, include: { invoicePayments: true } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") {
    return NextResponse.json({ error: "Pembayaran yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    const transactions = await tx.transaction.findMany({ where: { paymentId: id } })
    for (const t of transactions) {
      if (t.journalEntryId) {
        await tx.journalEntry.deleteMany({ where: { id: t.journalEntryId, postStatus: "draft" } })
      } else {
        const sourceType = t.refType ?? "invoice_payment"
        const sourceId = t.refType && t.refId ? t.refId : t.id
        await tx.journalEntry.deleteMany({ where: { sourceType, sourceId, postStatus: "draft" } })
      }
    }
    await tx.invoicePayment.deleteMany({ where: { paymentId: id } })
    await tx.transaction.deleteMany({ where: { paymentId: id } })
    await tx.payment.delete({ where: { id } })
  })

  return NextResponse.json({ ok: true })
}
