import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

interface LineInput {
  accountId: string
  debit?: number
  credit?: number
  memo?: string
}

const EPSILON = 0.5

/** Edit baris jurnal manual selagi masih DRAFT (ganti akun/debit/kredit/tambah/hapus baris).
 *  Cuma untuk jurnal manual (sourceType "manual") — jurnal otomatis (invoice/pembayaran/dst)
 *  diedit dari transaksi induknya (hapus draft, buat ulang), bukan lewat sini. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa edit jurnal manual" }, { status: 403 })

  const { id } = await params
  const entry = await prisma.journalEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (entry.postStatus !== "draft") return NextResponse.json({ error: "Jurnal yang sudah diposting/dibatalkan tidak bisa diedit" }, { status: 400 })
  if (entry.sourceType !== "manual") {
    return NextResponse.json({ error: "Jurnal otomatis diedit lewat transaksi induknya, bukan di sini" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const description = typeof body?.description === "string" ? body.description.trim() : entry.description
  const date = body?.date ? new Date(body.date) : entry.date
  const rawLines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []

  const lines = rawLines
    .map((l) => ({
      accountId: typeof l.accountId === "string" ? l.accountId : "",
      debit: Math.max(0, Number(l.debit) || 0),
      credit: Math.max(0, Number(l.credit) || 0),
      memo: typeof l.memo === "string" && l.memo ? l.memo : null,
    }))
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0))

  if (lines.length < 2) return NextResponse.json({ error: "Minimal 2 baris jurnal (debit dan kredit)" }, { status: 400 })

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    return NextResponse.json({ error: `Jurnal tidak balance: debit ${totalDebit} != kredit ${totalCredit}` }, { status: 400 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.journalLine.deleteMany({ where: { journalEntryId: id } })
    return tx.journalEntry.update({
      where: { id },
      data: { description, date, lines: { create: lines } },
      include: { lines: { include: { account: true } } },
    })
  })

  return NextResponse.json(updated)
}

/** Hapus jurnal manual DRAFT (belum diposting). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa hapus jurnal manual" }, { status: 403 })

  const { id } = await params
  const entry = await prisma.journalEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (entry.postStatus !== "draft") return NextResponse.json({ error: "Jurnal yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  if (entry.sourceType !== "manual") {
    return NextResponse.json({ error: "Jurnal otomatis dihapus lewat transaksi induknya, bukan di sini" }, { status: 400 })
  }

  await prisma.journalEntry.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
