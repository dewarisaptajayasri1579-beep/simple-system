import { notFound } from "next/navigation"
import { KwitansiPrintable } from "@/components/pembayaran/KwitansiPrintable"
import { prisma } from "@/lib/prisma"
import { kwitansiVerifyUrl, qrCodeDataUrl } from "@/lib/verify-url"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

/** Halaman publik (tanpa login, tanpa AppLayout) yang cuma me-render KwitansiPrintable —
 *  satu-satunya tujuannya dibuka headless Chromium (lihat api/payments/[id]/pdf/route.ts),
 *  sama pola dengan /invoices/[id]/print. Aman diakses tanpa login: id-nya UUID, sama pola
 *  "kunci"-nya dengan link PDF itu sendiri.
 *
 *  "Penerima" di kwitansi cetak biasa ambil dari user yang sedang login (staf yang lihat
 *  halaman detail Pembayaran) — di sini tidak ada login, jadi dipakai staf yang benar-benar
 *  memposting pembayarannya (postedById), bukan siapa pun yang kebetulan buka link. */
export default async function PaymentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      client: true,
      account: true,
      invoicePayments: {
        include: {
          invoice: { include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: { not: "voided" } } } }] } } } },
        },
      },
    },
  })

  if (!payment) notFound()

  const poster = payment.postedById ? await prisma.user.findUnique({ where: { id: payment.postedById } }) : null

  const isFullyPaid = payment.invoicePayments.every((ip) => ip.invoice.payments.reduce((sum, p) => sum + p.amount, 0) >= ip.invoice.totalAmount)
  const qrDataUrl = await qrCodeDataUrl(kwitansiVerifyUrl(payment.paymentNumber))

  return (
    <KwitansiPrintable
      payment={payment}
      receiverName={poster?.name ?? "SEVEN OS"}
      date={formatDate(payment.paidAt)}
      qrDataUrl={qrDataUrl}
      isFullyPaid={isFullyPaid}
    />
  )
}
