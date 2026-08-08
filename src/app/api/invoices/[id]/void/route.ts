import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { voidJournalEntryBySource } from "@/lib/accounting/post-journal"

/** Batalkan invoice yang sudah posted (salah input) — Owner-only. Invoice hilang dari Piutang/
 *  laporan (persis efeknya seperti belum pernah posting), jurnal HPP-nya (kalau ada) ikut
 *  ditandai voided, tapi record & jurnalnya tetap ada di riwayat dengan badge "Dibatalkan".
 *  Invoice yang sudah ada pembayaran (posted) tidak boleh dibatalkan langsung — batalkan dulu
 *  payment-nya. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa membatalkan invoice yang sudah posted" }, { status: 403 })

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (invoice.postStatus !== "posted") return NextResponse.json({ error: "Cuma invoice yang sudah posted yang bisa dibatalkan" }, { status: 400 })

  const hasPostedPayment = await prisma.invoicePayment.findFirst({
    where: { invoiceId: id, OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] },
  })
  if (hasPostedPayment) {
    return NextResponse.json({ error: "Invoice ini sudah ada pembayaran — batalkan dulu pembayarannya sebelum membatalkan invoice" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const voidReason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  const voided = await prisma.$transaction(async (tx) => {
    await voidJournalEntryBySource(tx, { sourceType: "invoice", sourceId: id, voidedById: user.id, voidReason: voidReason ?? undefined })
    return tx.invoice.update({
      where: { id },
      data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
      include: { client: true },
    })
  })

  return NextResponse.json(voided)
}
