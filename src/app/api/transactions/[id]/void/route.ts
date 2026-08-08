import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { voidJournalEntryBySource } from "@/lib/accounting/post-journal"

/** Batalkan Transaction yang sudah posted (manual Keuangan, atau hasil "Bayar Server/Domain"/
 *  "Tandai Lunas" Biaya Berkala) — Owner-only. Transaksi yang bagian dari Pembayaran dibatalkan
 *  lewat menu Pembayaran, bukan di sini.
 *
 *  Keterbatasan yang disengaja: kalau ini hasil "Bayar Server/Domain"/"Tandai Lunas",
 *  `lastPaidAt` milik Server/Domain/RecurringBill terkait TIDAK otomatis dikembalikan — nilai
 *  lamanya tidak disimpan di mana pun. Perlu dikoreksi manual lewat Master Data kalau perlu. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa membatalkan transaksi yang sudah posted" }, { status: 403 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { invoicePayment: true } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  if (transaction.postStatus !== "posted") return NextResponse.json({ error: "Cuma transaksi yang sudah posted yang bisa dibatalkan" }, { status: 400 })
  if (transaction.invoicePayment || transaction.paymentId) {
    return NextResponse.json({ error: "Transaksi ini bagian dari Pembayaran — batalkan lewat menu Pembayaran" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const voidReason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  const sourceType = transaction.refType ?? "transaction"
  const sourceId = transaction.refType && transaction.refId ? transaction.refId : transaction.id

  const voided = await prisma.$transaction(async (tx) => {
    await voidJournalEntryBySource(tx, { sourceType: sourceType as never, sourceId, voidedById: user.id, voidReason: voidReason ?? undefined })
    return tx.transaction.update({
      where: { id },
      data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
    })
  })

  return NextResponse.json(voided)
}
