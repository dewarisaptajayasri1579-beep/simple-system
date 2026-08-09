import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, lines: { include: { item: true } }, payments: { include: { account: true }, orderBy: { paidAt: "asc" } } },
  })

  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  return NextResponse.json(invoice)
}

/** Hapus invoice DRAFT (belum diposting) — dipakai untuk "edit": hapus draft, input ulang.
 *  Invoice yang sudah posted tidak boleh dihapus lewat sini. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (invoice.postStatus !== "draft") {
    return NextResponse.json({ error: "Invoice yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  }

  await prisma.$transaction([
    // Invoice draft bikin 2 jurnal draft sekaligus saat dibuat (lihat POST /api/invoices) — HPP
    // (sourceType "invoice") DAN Piutang/Pendapatan/PPN (sourceType "invoice_revenue"). Dua-duanya
    // wajib ikut dibersihkan di sini, kalau tidak jurnal "invoice_revenue"-nya nyangkut terus
    // nunjuk ke invoice yang sudah dihapus (bug lama — cuma "invoice" yang dibersihkan).
    prisma.journalEntry.deleteMany({ where: { sourceType: { in: ["invoice", "invoice_revenue"] }, sourceId: id, postStatus: "draft" } }),
    prisma.invoice.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
