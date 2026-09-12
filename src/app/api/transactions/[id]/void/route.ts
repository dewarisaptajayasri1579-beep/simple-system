import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { voidJournalEntryBySource, voidJournalEntryById } from "@/lib/accounting/post-journal"
import { logTransactionEvent } from "@/lib/accounting/transaction-audit"
import { assertAccountsNotNegative, snapshotAccountBalances } from "@/lib/accounting/cash-guard"

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

  try {
    const voided = await prisma.$transaction(async (tx) => {
      const before = await snapshotAccountBalances(tx, [transaction.accountId])
      if (transaction.journalEntryId) {
        await voidJournalEntryById(tx, transaction.journalEntryId, user.id, voidReason ?? undefined)
      } else {
        const sourceType = transaction.refType ?? "transaction"
        const sourceId = transaction.refType && transaction.refId ? transaction.refId : transaction.id
        await voidJournalEntryBySource(tx, { sourceType: sourceType as never, sourceId, voidedById: user.id, voidReason: voidReason ?? undefined })
      }
      await logTransactionEvent(tx, { transactionId: id, action: "voided", actorUserId: user.id, metadata: voidReason ? { reason: voidReason } : undefined })
      const result = await tx.transaction.update({
        where: { id },
        data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
      })
      // Membatalkan PEMASUKAN sama efeknya dengan pengeluaran (uang yang masuk ditarik lagi) —
      // jadi ikut dijaga supaya saldo kas/bank tidak minus. Void pengeluaran justru menambah
      // saldo, jadi tidak perlu dicek.
      if (transaction.type === "income") await assertAccountsNotNegative(tx, [transaction.accountId], before)
      return result
    })
    return NextResponse.json(voided)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membatalkan transaksi" }, { status: 400 })
  }
}
