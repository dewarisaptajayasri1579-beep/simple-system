import { notFound } from "next/navigation"
import { NotaPrintable } from "@/components/penjualan/NotaPrintable"
import { prisma } from "@/lib/prisma"
import { invoiceVerifyUrl, qrCodeDataUrl } from "@/lib/verify-url"

/** Halaman publik (tanpa login, tanpa AppLayout) yang cuma me-render NotaPrintable —
 *  satu-satunya tujuannya dibuka headless Chromium (lihat api/invoices/[id]/pdf/route.ts)
 *  supaya PDF yang dikirim lewat WA persis sama dengan hasil "Cetak Invoice" di browser,
 *  bukan re-implementasi layout terpisah (dulu pakai @react-pdf/renderer, gampang divergen —
 *  contoh: terbilang yang nabrak karena Yoga tidak shrink/wrap seperti flexbox browser).
 *  Aman diakses tanpa login: id-nya UUID, sama pola "kunci"-nya dengan link PDF itu sendiri. */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { client: true, lines: true },
    }),
    prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
  ])

  if (!invoice) notFound()

  const bank = invoice.ppnEnabled
    ? { name: settings.paymentBankNamePpn, account: settings.paymentAccountNamePpn, number: settings.paymentAccountNumberPpn }
    : { name: settings.paymentBankNameNonPpn, account: settings.paymentAccountNameNonPpn, number: settings.paymentAccountNumberNonPpn }

  const qrDataUrl = await qrCodeDataUrl(invoiceVerifyUrl(invoice.invoiceNumber))

  return <NotaPrintable invoice={invoice} bank={bank} qrDataUrl={qrDataUrl} />
}
