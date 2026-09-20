import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { invoiceCashDue } from "@/lib/invoice-due"

/** Tandai invoice sebagai **Piutang Pending** (POST) atau lepas penandaan itu (DELETE) —
 *  Owner-only, alasan WAJIB diisi.
 *
 *  Pending = penagihannya SENGAJA ditunda sementara (client minta tempo, nunggu berita acara,
 *  lagi dinego). Uangnya masih diharapkan masuk, jadi invoice ini TETAP DIHITUNG di Piutang
 *  Outstanding — beda dari Piutang Ragu-Ragu (lihat ../doubtful) yang dikeluarkan dari hitungan
 *  karena dianggap tidak akan cair. Yang berhenti cuma penagihan OTOMATIS (cron WA follow-up
 *  piutang), supaya client yang sudah minta tempo tidak terus dikirimi tagihan.
 *
 *  Sama seperti ragu-ragu: tidak ada jurnal sama sekali — Piutang di app ini bukan akun GL,
 *  cuma Invoice.totalAmount − pembayaran posted (lihat pedoman_akunting.md). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") {
    return NextResponse.json({ error: "Cuma Owner yang bisa menandai Piutang Pending" }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const reason = typeof body?.reason === "string" ? body.reason.trim() : ""
  if (!reason) return NextResponse.json({ error: "Alasan wajib diisi" }, { status: 400 })

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, isPemungutPpn: true } },
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
  })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (invoice.postStatus !== "posted") {
    return NextResponse.json({ error: "Cuma invoice yang sudah posted yang bisa ditandai pending" }, { status: 400 })
  }
  // Ragu-ragu itu tingkat lebih berat dari pending (sudah keluar dari Piutang Outstanding) —
  // turun lagi ke pending harus lewat "Aktifkan Lagi" dulu supaya jelas di riwayat auditnya.
  if (invoice.doubtfulAt) {
    return NextResponse.json(
      { error: "Invoice ini sedang ditandai Piutang Ragu-Ragu — aktifkan lagi dulu sebelum ditandai pending" },
      { status: 400 }
    )
  }
  if (invoice.pendingAt) return NextResponse.json({ error: "Invoice ini sudah ditandai pending" }, { status: 400 })

  const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = invoiceCashDue(invoice, invoice.client.isPemungutPpn) - paid
  if (remaining <= 0) {
    return NextResponse.json({ error: "Invoice ini sudah lunas — tidak ada tagihan yang perlu ditunda" }, { status: 400 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.invoice.update({
      where: { id },
      data: { pendingAt: new Date(), pendingReason: reason, pendingById: user.id },
      include: { client: true },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "invoice_mark_pending",
        entityType: "invoice",
        entityId: id,
        metadataJson: { invoiceNumber: invoice.invoiceNumber, clientName: invoice.client.name, remaining, reason },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}

/** Lepas status pending — tagihan kembali masuk antrean penagihan otomatis seperti biasa. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") {
    return NextResponse.json({ error: "Cuma Owner yang bisa melepas status Piutang Pending" }, { status: 403 })
  }

  const { id } = await params
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { client: { select: { name: true } } } })
  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })
  if (!invoice.pendingAt) return NextResponse.json({ error: "Invoice ini tidak ditandai pending" }, { status: 400 })

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.invoice.update({
      where: { id },
      data: { pendingAt: null, pendingReason: null, pendingById: null },
      include: { client: true },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: "invoice_unmark_pending",
        entityType: "invoice",
        entityId: id,
        metadataJson: {
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.client.name,
          previousReason: invoice.pendingReason,
        },
      },
    })

    return result
  })

  return NextResponse.json(updated)
}
