import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui"
import { PrintButton } from "@/components/penjualan/PrintButton"
import { PaymentPostingBar } from "@/components/pembayaran/PaymentPostingBar"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { ArrowLeft } from "lucide-react"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
  })

  if (!payment) notFound()

  // Sumber jurnal payment ini — pakai journalEntryId (link presisi ke jurnal yang dibuat
  // BARENGAN transaksi ini) kalau ada. Fallback ke sourceType+sourceId cuma buat baris lama
  // (sebelum kolom journalEntryId ada) — TAPI itu dipakai bareng-bareng oleh SELURUH histori
  // pembayaran domain/server yang sama, jadi bisa kebawa jurnal transaksi lain/lama yang sudah
  // dibatalkan (ini penyebab bug "kok jurnal yang dibatalkan masih ikut nongol").
  const paymentTransactions = await prisma.transaction.findMany({ where: { paymentId: id } })
  const journalSources = paymentTransactions.map((t) =>
    t.journalEntryId
      ? { entryId: t.journalEntryId }
      : t.refType && t.refId
        ? { sourceType: t.refType, sourceId: t.refId }
        : { sourceType: "invoice_payment", sourceId: t.id }
  )

  // Biaya domain/server yang dikaitkan ke pembayaran ini (baris "Biaya" di form Pelunasan) —
  // dicatat sebagai Transaction expense terpisah (lihat markDomainPaid/markServerPaid), sama
  // paymentId tapi refType/refId nunjuk ke domain/server yang dibayar sekalian dari kas yang sama.
  const costTransactions = paymentTransactions.filter((t) => t.refType === "domain" || t.refType === "server")
  const totalCost = costTransactions.reduce((sum, t) => sum + t.grossAmount, 0)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between">
          <Link href="/pembayaran" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <PrintButton />
        </div>

        <PaymentPostingBar paymentId={payment.id} postStatus={payment.postStatus as "draft" | "posted" | "voided"} sources={journalSources} />

        <Card variant="panel" padding="lg" className="print:shadow-none print:border-none print:bg-white">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900">SEVEN OS</h1>
              <p className="text-xs text-slate-500 font-semibold">Kwitansi Pembayaran</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-slate-900">{payment.paymentNumber}</p>
              <p className="text-xs text-slate-500 font-semibold">{formatDate(payment.paidAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Diterima Dari</p>
              <p className="font-bold text-slate-900 mt-1">{payment.client.name}</p>
              {payment.client.phoneNumber && <p className="text-sm text-slate-600">{payment.client.phoneNumber}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold text-slate-500 uppercase">Masuk ke Akun</p>
              <p className="font-semibold text-slate-800">{payment.account.name}</p>
            </div>
          </div>

          <div className="mt-6">
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Invoice</TableHead>
                    <TableHead>Total Invoice</TableHead>
                    <TableHead>Dibayar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payment.invoicePayments.map((ip) => (
                    <TableRow key={ip.id}>
                      <TableCell className="font-semibold">
                        <Link href={`/penjualan/${ip.invoice.id}`} className="hover:underline">
                          {ip.invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{formatRupiah(ip.invoice.totalAmount)}</TableCell>
                      <TableCell className="font-semibold">{formatRupiah(ip.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>

          {costTransactions.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Biaya (dipotong dari kas yang sama)</p>
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Keterangan</TableHead>
                      <TableHead>Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costTransactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.description}</TableCell>
                        <TableCell className="font-semibold">{formatRupiah(t.grossAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          )}

          <div className="flex justify-end mt-6">
            <div className="w-full sm:w-72 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total Diterima</span>
                <span className="font-semibold text-slate-900">{formatRupiah(payment.totalAmount)}</span>
              </div>
              {totalCost > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Total Biaya</span>
                  <span className="font-semibold text-rose-700">-{formatRupiah(totalCost)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-black text-slate-900 pt-2 border-t border-slate-200/60">
                <span>Bersih ke Kas</span>
                <span>{formatRupiah(payment.totalAmount - totalCost)}</span>
              </div>
            </div>
          </div>

          {payment.notes && (
            <p className="mt-6 text-sm text-slate-600 border-t border-slate-200/60 pt-4">
              <span className="font-bold">Catatan: </span>
              {payment.notes}
            </p>
          )}
        </Card>
      </div>
    </AppLayout>
  )
}
