import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell, Button, Alert } from "@/components/ui"
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge"
import { PrintButton } from "@/components/penjualan/PrintButton"
import { InvoiceWhatsAppButton } from "@/components/penjualan/InvoiceWhatsAppButton"
import { NotaPrintable } from "@/components/penjualan/NotaPrintable"
import { InvoicePostButton } from "@/components/penjualan/InvoicePostButton"
import { InvoiceDeleteButton } from "@/components/penjualan/InvoiceDeleteButton"
import { InvoiceEditableDetail } from "@/components/penjualan/InvoiceEditableDetail"
import { VoidButton } from "@/components/akuntansi/VoidButton"
import { JournalButton } from "@/components/akuntansi/JournalButton"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { invoiceVerifyUrl, qrCodeDataUrl } from "@/lib/verify-url"
import { invoiceCashDue } from "@/lib/invoice-due"
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

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { client: true, lines: true, payments: { include: { account: true, payment: true }, orderBy: { paidAt: "asc" } } },
    }),
    prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
  ])

  if (!invoice) notFound()

  // Terbayar/Sisa hanya menghitung pembayaran yang efektif: legacy (tanpa Payment
  // induk) atau Payment induknya sudah posted. Riwayat pembayaran di bawah tetap
  // menampilkan SEMUA baris (termasuk draft) agar bisa direview.
  const effectivePayments = invoice.payments.filter((p) => p.paymentId === null || p.payment?.postStatus === "posted")
  const paid = effectivePayments.reduce((sum, p) => sum + p.amount, 0)
  const isPemungutInvoice = invoice.client.isPemungutPpn && invoice.ppnEnabled
  const remaining = Math.max(0, invoiceCashDue(invoice, invoice.client.isPemungutPpn) - paid)

  // Rekening tujuan beda tergantung invoice pakai PPN atau tidak (lihat Pengaturan > Umum).
  const bank = invoice.ppnEnabled
    ? { name: settings.paymentBankNamePpn, account: settings.paymentAccountNamePpn, number: settings.paymentAccountNumberPpn }
    : { name: settings.paymentBankNameNonPpn, account: settings.paymentAccountNameNonPpn, number: settings.paymentAccountNumberNonPpn }

  const qrDataUrl = await qrCodeDataUrl(invoiceVerifyUrl(invoice.invoiceNumber))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between">
          <Link href="/penjualan" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <div className="flex gap-3">
            <PrintButton />
            {invoice.client.phoneNumber && (
              <InvoiceWhatsAppButton
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                totalAmount={invoice.totalAmount}
                clientName={invoice.client.name}
                clientPhone={invoice.client.phoneNumber}
              />
            )}
            {invoice.totalCost > 0 && (
              <JournalButton
                title={`Jurnal — ${invoice.invoiceNumber}`}
                sources={[{ sourceType: "invoice", sourceId: invoice.id }]}
                postUrl={invoice.postStatus === "draft" ? `/api/invoices/${invoice.id}/post` : undefined}
              />
            )}
            {invoice.postStatus === "draft" && <InvoiceDeleteButton invoiceId={invoice.id} />}
            {invoice.postStatus === "draft" && <InvoicePostButton invoiceId={invoice.id} />}
            {invoice.postStatus === "posted" && (
              <VoidButton voidUrl={`/api/invoices/${invoice.id}/void`} itemLabel={`invoice ${invoice.invoiceNumber}`} />
            )}
            {invoice.postStatus === "posted" && remaining > 0 && (
              <Link href={`/pembayaran?clientId=${invoice.clientId}&invoiceId=${invoice.id}`}>
                <Button variant="primary">Input Pembayaran</Button>
              </Link>
            )}
          </div>
        </div>

        {invoice.postStatus === "draft" && (
          <Alert variant="warning" className="no-print">
            Invoice ini masih <strong>Draft</strong> — belum bisa menerima pembayaran. Posting dulu lewat tombol di atas.
          </Alert>
        )}

        {/* Tampilan layar — dilihat staf sehari-hari, tidak ikut tercetak (lihat NotaPrintable
           di bawah buat format yang benar-benar keluar di kertas). */}
        <Card variant="panel" padding="lg" className="no-print">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900">SEVEN OS</h1>
              <p className="text-xs text-slate-500 font-semibold">Invoice / Faktur Penjualan</p>
            </div>
            <div className="text-right space-y-1.5">
              <p className="text-lg font-black text-slate-900">{invoice.invoiceNumber}</p>
              <div className="flex items-center gap-2 justify-end">
                <StatusBadge type={invoice.status as StatusBadgeType} size="sm" />
                <StatusBadge type={invoice.postStatus as StatusBadgeType} size="sm" />
              </div>
            </div>
          </div>

          <InvoiceEditableDetail
            invoiceId={invoice.id}
            editable={invoice.postStatus === "draft"}
            clientId={invoice.clientId}
            clientName={invoice.client.name}
            clientAddress={invoice.client.address ?? ""}
            clientPhone={invoice.client.phoneNumber ?? ""}
            issuedAt={invoice.issuedAt}
            dueDate={invoice.dueDate}
            notes={invoice.notes ?? ""}
            ppnEnabled={invoice.ppnEnabled}
            ppnRate={invoice.ppnRate}
            discountAmount={invoice.discountAmount}
            subtotal={invoice.subtotal}
            ppnAmount={invoice.ppnAmount}
            totalAmount={invoice.totalAmount}
            paid={paid}
            remaining={remaining}
            isPemungutInvoice={isPemungutInvoice}
            noBuktiPungutPpn={invoice.noBuktiPungutPpn}
            tglBuktiPungutPpn={invoice.tglBuktiPungutPpn ? invoice.tglBuktiPungutPpn.toISOString() : null}
            dpAmount={invoice.dpAmount}
            lines={invoice.lines}
          />
        </Card>

        {/* Cuma tampil saat print (lihat .print-only di globals.css) — format nota sesuai
           referensi lama (nota/Format Nota.png), tidak pernah dilihat staf di layar. */}
        <NotaPrintable invoice={invoice} bank={bank} qrDataUrl={qrDataUrl} paid={paid} dpAmount={invoice.dpAmount} />

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
                    <TableHead>Status</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.paidAt)}</TableCell>
                      <TableCell>{p.account.name}</TableCell>
                      <TableCell className="font-semibold">{formatRupiah(p.amount)}</TableCell>
                      <TableCell>
                        {p.paymentId === null || p.payment?.postStatus === "posted" ? (
                          <span className="text-emerald-700 font-semibold text-xs">Posted</span>
                        ) : (
                          <span className="text-amber-600 font-semibold text-xs">Draft</span>
                        )}
                      </TableCell>
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
