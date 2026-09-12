import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { assertKasBankCoaNotNegative, snapshotKasBankCoaBalances } from "@/lib/accounting/cash-guard"

/** Batalkan jurnal MANUAL yang sudah posted — Owner-only. Jurnal otomatis (invoice/pembayaran/
 *  transaksi/dst) dibatalkan lewat transaksi induknya (endpoint void masing-masing), bukan
 *  lewat sini, supaya efek lainnya (piutang, saldo, lastPaidAt) ikut terkoreksi konsisten. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa membatalkan jurnal manual" }, { status: 403 })

  const { id } = await params
  const entry = await prisma.journalEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (entry.postStatus !== "posted") return NextResponse.json({ error: "Cuma jurnal yang sudah posted yang bisa dibatalkan" }, { status: 400 })
  if (entry.sourceType !== "manual") {
    return NextResponse.json({ error: "Jurnal otomatis dibatalkan lewat transaksi induknya, bukan di sini" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const voidReason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  try {
    const voided = await prisma.$transaction(async (tx) => {
      const before = await snapshotKasBankCoaBalances(tx, id)
      const result = await tx.journalEntry.update({
        where: { id },
        data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
        include: { lines: { include: { account: true } } },
      })
      // Membatalkan jurnal yang MENAMBAH kas/bank sama efeknya dengan pengeluaran — saldo buku
      // besar Kas & Bank ikut dijaga supaya tidak minus.
      await assertKasBankCoaNotNegative(tx, id, before)
      return result
    })
    return NextResponse.json(voided)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membatalkan jurnal" }, { status: 400 })
  }
}
