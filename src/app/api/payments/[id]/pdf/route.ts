import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"

import { prisma } from "@/lib/prisma"
import { KwitansiPdfDocument } from "@/lib/kwitansi-pdf"
import { kwitansiVerifyUrl, qrCodeDataUrl } from "@/lib/verify-url"

/** Sengaja TANPA login — link PDF ini dikirim ke Client lewat WA (lihat PaymentWhatsAppButton),
 *  jadi harus bisa dibuka tanpa akun. Payment id-nya UUID (praktis tidak bisa ditebak), sama
 *  pola dengan /api/invoices/[id]/pdf. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
  })

  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })

  const qrDataUrl = await qrCodeDataUrl(kwitansiVerifyUrl(payment.paymentNumber))
  const buffer = await renderToBuffer(KwitansiPdfDocument({ payment, qrDataUrl }))

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${payment.paymentNumber.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  })
}
