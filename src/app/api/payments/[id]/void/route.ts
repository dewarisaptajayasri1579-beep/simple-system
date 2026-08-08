import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { voidJournalEntryBySource } from "@/lib/accounting/post-journal"

/** Batalkan payment yang sudah posted (salah input) — Owner-only. Semua Transaction yang
 *  dibuat bareng payment ini (pelunasan tiap invoice + costLink Bayar Domain/Server kalau ada)
 *  ikut dibatalkan sekaligus, lalu status tiap invoice terkait direcompute (piutangnya balik
 *  seperti sebelum payment ini ada).
 *
 *  Keterbatasan yang disengaja: kalau ada costLink Bayar Domain/Server, `lastPaidAt` milik
 *  domain/server itu TIDAK otomatis dikembalikan ke nilai sebelumnya (nilai lamanya tidak
 *  disimpan di mana pun) — perlu dikoreksi manual lewat kolom "Terakhir Bayar" di Master Data
 *  kalau memang perlu. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa membatalkan pembayaran yang sudah posted" }, { status: 403 })

  const { id } = await params
  const payment = await prisma.payment.findUnique({ where: { id }, include: { invoicePayments: true } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "posted") return NextResponse.json({ error: "Cuma pembayaran yang sudah posted yang bisa dibatalkan" }, { status: 400 })

  const body = await request.json().catch(() => null)
  const voidReason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  const voided = await prisma.$transaction(async (tx) => {
    // Void Payment-nya duluan (sebelum recompute status invoice di bawah) supaya query
    // "payment yang masih posted" tidak ikut menghitung payment ini lagi.
    const result = await tx.payment.update({
      where: { id },
      data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
      include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
    })

    const transactions = await tx.transaction.findMany({ where: { paymentId: id, postStatus: "posted" } })
    for (const t of transactions) {
      const sourceType = t.refType ?? "invoice_payment"
      const sourceId = t.refType && t.refId ? t.refId : t.id
      await voidJournalEntryBySource(tx, { sourceType: sourceType as never, sourceId, voidedById: user.id, voidReason: voidReason ?? undefined })
      await tx.transaction.update({
        where: { id: t.id },
        data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
      })
    }

    for (const ip of payment.invoicePayments) {
      const postedPayments = await tx.invoicePayment.findMany({
        where: { invoiceId: ip.invoiceId, OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] },
      })
      const totalPaid = postedPayments.reduce((sum, p) => sum + p.amount, 0)
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: ip.invoiceId } })
      const newStatus = totalPaid >= invoice.totalAmount - 0.5 ? "paid" : totalPaid > 0 ? "partial" : "unpaid"
      await tx.invoice.update({ where: { id: ip.invoiceId }, data: { status: newStatus } })
    }

    return result
  })

  return NextResponse.json(voided)
}
