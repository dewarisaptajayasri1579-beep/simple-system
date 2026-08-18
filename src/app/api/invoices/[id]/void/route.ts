import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Batalkan invoice yang sudah posted (salah input) — Owner-only. Invoice hilang dari Piutang
 *  (field biasa, bukan jurnal — lihat pedoman_akunting.md). Tidak ada jurnal yang perlu
 *  dibatalkan di sini karena Invoice tidak pernah bikin jurnal apa pun; Invoice yang sudah ada
 *  pembayaran (posted) tidak boleh dibatalkan langsung — batalkan dulu payment-nya (itu yang
 *  bawa jurnal Pendapatan/PPN/HPP-nya). */
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
    const updated = await tx.invoice.update({
      where: { id },
      data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
      include: { client: true },
    })

    // Kalau invoice ini kelahiran dari "Tagih Sekarang" (Dashboard Domain/Server/Maintenance),
    // reset siklus BillingFollowUp-nya biar item itu balik bisa ditagih ulang — tanpa ini,
    // invoicedAt/invoiceId tetap nempel dan status tindak-lanjutnya nyangkut selamanya di
    // "Menunggu jawaban Client" walau invoice-nya sudah dibatalkan (lihat billing-follow-up.ts).
    await tx.billingFollowUp.updateMany({
      where: { invoiceId: id },
      data: { invoicedAt: null, invoiceId: null, invoicedById: null, clientRespondedAt: null, promisedPayAt: null, voidedAt: new Date() },
    })

    return updated
  })

  return NextResponse.json(voided)
}
