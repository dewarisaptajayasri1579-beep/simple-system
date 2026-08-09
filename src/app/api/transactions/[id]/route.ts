import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { account: true, category: true } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  return NextResponse.json(transaction)
}

/** Hapus Transaction DRAFT (belum diposting) — dipakai untuk "edit": hapus draft, input ulang
 *  (Input Pemasukan/Pengeluaran manual, atau draft "Bayar Server/Domain"/"Tandai Lunas"). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { invoicePayment: true } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  if (transaction.postStatus !== "draft") {
    return NextResponse.json({ error: "Transaksi yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  }
  if (transaction.invoicePayment) {
    return NextResponse.json({ error: "Transaksi ini bagian dari Pembayaran — hapus lewat menu Pembayaran" }, { status: 400 })
  }

  const journalWhere = transaction.journalEntryId
    ? { id: transaction.journalEntryId, postStatus: "draft" as const }
    : {
        sourceType: transaction.refType ?? "transaction",
        sourceId: transaction.refType && transaction.refId ? transaction.refId : transaction.id,
        postStatus: "draft" as const,
      }

  await prisma.$transaction([
    prisma.journalEntry.deleteMany({ where: journalWhere }),
    prisma.transaction.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
