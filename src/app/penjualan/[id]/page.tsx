import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell, Button } from "@/components/ui"
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge"
import { PrintButton } from "@/components/penjualan/PrintButton"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { ArrowLeft } from "lucide-react"

function formatDate(date: Date | null) {
  if (!date) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, lines: true, payments: { include: { account: true }, orderBy: { paidAt: "asc" } } },
  })

  if (!invoice) notFound()

  const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = Math.max(0, invoice.totalAmount - paid)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between">
          <Link href="/penjualan" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <div className="flex gap-3">
            <PrintButton />
            {remaining > 0 && (
              <Link href={`/pembayaran?clientId=${invoice.clientId}&invoiceId=${invoice.id}`}>
                <Button variant="primary">Input Pembayaran</Button>
              </Link>
            )}
          </div>
        </div>

        <Card variant="panel" padding="lg" className="print:shadow-none print:border-none print:bg-white">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900">SEVEN OS</h1>
              <p className="text-xs text-slate-500 font-semibold">Invoice / Faktur Penjualan</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-slate-900">{invoice.invoiceNumber}</p>
              <StatusBadge type={invoice.status as StatusBadgeType} size="sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Ditagihkan Kepada</p>
              <p className="font-bold text-slate-900 mt-1">{invoice.client.name}</p>
              {invoice.client.address && <p className="text-sm text-slate-600">{invoice.client.address}</p>}
              {invoice.client.phoneNumber && <p className="text-sm text-slate-600">{invoice.client.phoneNumber}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold text-slate-500 uppercase">Tanggal Terbit</p>
              <p className="font-semibold text-slate-800">{formatDate(invoice.issuedAt)}</p>
              <p className="text-xs font-bold text-slate-500 uppercase mt-2">Jatuh Tempo</p>
              <p className="font-semibold text-slate-800">{formatDate(invoice.dueDate)}</p>
            </div>
          </div>

          <div className="mt-6">
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keterangan</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Harga</TableHead>
                    <TableHead>Diskon</TableHead>
                    <TableHead>Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.description}</TableCell>
                      <TableCell>{line.qty}</TableCell>
                      <TableCell>{formatRupiah(line.unitPrice)}</TableCell>
                      <TableCell>{formatRupiah(line.discountAmount)}</TableCell>
                      <TableCell className="font-semibold">{formatRupiah(line.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>

          <div className="flex justify-end mt-6">
            <div className="w-full sm:w-72 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatRupiah(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Diskon</span>
                <span>- {formatRupiah(invoice.discountAmount)}</span>
              </div>
              {invoice.ppnEnabled && (
                <div className="flex justify-between text-slate-600">
                  <span>PPN {invoice.ppnRate}%</span>
                  <span>{formatRupiah(invoice.ppnAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200/60">
                <span>Total</span>
                <span>{formatRupiah(invoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Terbayar</span>
                <span>{formatRupiah(paid)}</span>
              </div>
              <div className="flex justify-between text-rose-700 font-bold">
                <span>Sisa</span>
                <span>{formatRupiah(remaining)}</span>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <p className="mt-6 text-sm text-slate-600 border-t border-slate-200/60 pt-4">
              <span className="font-bold">Catatan: </span>
              {invoice.notes}
            </p>
          )}
        </Card>

        {invoice.payments.length > 0 && (
          <Card variant="panel" padding="none" className="no-print">
            <CardHeader className="p-5 sm:p-6 mb-0">
              <CardTitle>Riwayat Pembayaran</CardTitle>
              <CardDescription>{invoice.payments.length} kali pembayaran</CardDescription>
            </CardHeader>
            <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Akun</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paidAt)}</TableCell>
                      <TableCell>{p.account.name}</TableCell>
                      <TableCell className="font-semibold">{formatRupiah(p.amount)}</TableCell>
                      <TableCell>{p.notes ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
