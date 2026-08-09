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

  // Invoice tidak pernah bikin jurnal apa pun (lihat pedoman_akunting.md), jadi tidak ada
  // jurnal draft yang perlu ikut dibersihkan di sini — cukup hapus invoice-nya (InvoiceLine
  // ikut terhapus lewat onDelete: Cascade).
  await prisma.invoice.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
