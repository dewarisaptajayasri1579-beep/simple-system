import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"

import { prisma } from "@/lib/prisma"
import { InvoicePdfDocument } from "@/lib/invoice-pdf"

/** Sengaja TANPA login — link PDF ini dikirim ke Client lewat WA (lihat InvoiceWhatsAppButton),
 *  jadi harus bisa dibuka tanpa akun. Invoice id-nya UUID (praktis tidak bisa ditebak), itu satu-
 *  satunya "kunci"-nya, sama seperti pola share-link pada umumnya. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { client: true, lines: true },
    }),
    prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
  ])

  if (!invoice) return NextResponse.json({ error: "Invoice tidak ditemukan" }, { status: 404 })

  const bank = invoice.ppnEnabled
    ? { name: settings.paymentBankNamePpn, account: settings.paymentAccountNamePpn, number: settings.paymentAccountNumberPpn }
    : { name: settings.paymentBankNameNonPpn, account: settings.paymentAccountNameNonPpn, number: settings.paymentAccountNumberNonPpn }

  const buffer = await renderToBuffer(InvoicePdfDocument({ invoice, bank }))

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  })
}
