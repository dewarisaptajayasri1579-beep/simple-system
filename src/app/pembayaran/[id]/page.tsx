import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui"
import { PrintButton } from "@/components/penjualan/PrintButton"
import { PaymentPostingBar } from "@/components/pembayaran/PaymentPostingBar"
import { SlottingStatusBar } from "@/components/pembayaran/SlottingStatusBar"
import { EditablePaymentAccount } from "@/components/pembayaran/EditablePaymentAccount"
import { EditableInvoicePaymentAmount } from "@/components/pembayaran/EditableInvoicePaymentAmount"
import { PaymentCostSection } from "@/components/pembayaran/PaymentCostSection"
import { KwitansiPrintable } from "@/components/pembayaran/KwitansiPrintable"
import { PaymentWhatsAppButton } from "@/components/pembayaran/PaymentWhatsAppButton"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { kwitansiVerifyUrl, qrCodeDataUrl } from "@/lib/verify-url"
import { resolveUserNames } from "@/lib/user-names"
import { AuditTrail } from "@/components/shared/AuditTrail"
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

  const [payment, domains, servers, maintenances] = await Promise.all([
    prisma.payment.findUnique({
      where: { id },
      include: {
        client: true,
        account: true,
        invoicePayments: {
          include: {
            invoice: {
              include: {
                // Total dibayar SEMUA payment invoice ini (termasuk payment yang lagi dilihat
                // sekarang) yang belum dibatalkan — dipakai hitung "Kurang Bayar" otomatis di
                // bawah, ganti catatan manual yang sebelumnya diketik staf sendiri.
                payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: { not: "voided" } } } }] } },
              },
            },
          },
        },
        revenueSlot: true,
      },
    }),
    prisma.domain.findMany({ where: { sellPrice: { gt: 0 } }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.server.findMany({ where: { price: { gt: 0 } }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.maintenance.findMany({ where: { price: { gt: 0 } }, include: { client: true }, orderBy: { name: "asc" } }),
  ])

  if (!payment) notFound()

  const userNames = await resolveUserNames([payment.createdById, payment.postedById, payment.voidedById])

  // Sumber jurnal payment ini — pakai journalEntryId (link presisi ke jurnal yang dibuat
  // BARENGAN transaksi ini) kalau ada. Fallback ke sourceType+sourceId cuma buat baris lama
  // (sebelum kolom journalEntryId ada) — TAPI itu dipakai bareng-bareng oleh SELURUH histori
  // pembayaran domain/server yang sama, jadi bisa kebawa jurnal transaksi lain/lama yang sudah
  // dibatalkan (ini penyebab bug "kok jurnal yang dibatalkan masih ikut nongol").
  const paymentTransactions = await prisma.transaction.findMany({ where: { paymentId: id }, include: { account: true } })
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
  // Biaya (domain/server/maintenance yang dikaitkan, ATAU manual) — semua Transaction expense
  // yang nempel ke payment ini. Baris pendapatan invoice-nya sendiri selalu type "income", jadi
  // filter type "expense" ini aman buat pisahin baris Biaya tanpa perlu peduli refType-nya apa.
  const costTransactions = paymentTransactions.filter((t) => t.type === "expense")
  const totalCost = costTransactions.reduce((sum, t) => sum + t.grossAmount, 0)
  const canEditCosts = payment.postStatus === "draft" && user.role === "owner"

  const qrDataUrl = await qrCodeDataUrl(kwitansiVerifyUrl(payment.paymentNumber))

  // Dipakai kwitansi cetak — jangan sebut "Pelunasan" kalau ada invoice yang masih nyisa
  // (lihat "Kurang Bayar" di tabel bawah), biar tidak menyesatkan Client yang bayarnya dicicil.
  const isFullyPaid = payment.invoicePayments.every((ip) => ip.invoice.payments.reduce((sum, p) => sum + p.amount, 0) >= ip.invoice.totalAmount)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between">
          <Link href="/pembayaran" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </Link>
          <div className="flex gap-3">
            <PrintButton label="Cetak Kwitansi" />
            {payment.postStatus === "posted" && payment.client.phoneNumber && (
              <PaymentWhatsAppButton
                paymentId={payment.id}
                paymentNumber={payment.paymentNumber}
                totalAmount={payment.totalAmount}
                clientName={payment.client.name}
                clientPhone={payment.client.phoneNumber}
              />
            )}
          </div>
        </div>

        <PaymentPostingBar paymentId={payment.id} postStatus={payment.postStatus as "draft" | "posted" | "voided"} sources={journalSources} />

        {payment.revenueSlot && (
          <SlottingStatusBar
            revenueSlotId={payment.revenueSlot.id}
            status={payment.revenueSlot.status as "draft" | "processed" | "skipped"}
            isOwner={user.role === "owner"}
          />
        )}

        {/* Tampilan layar — dilihat staf sehari-hari, tidak ikut tercetak (lihat KwitansiPrintable
           di bawah buat format yang benar-benar keluar di kertas). */}
        <Card variant="panel" padding="lg" className="no-print">
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
              {payment.postStatus === "draft" ? (
                <EditablePaymentAccount paymentId={payment.id} accountId={payment.accountId} accountName={payment.account.name} />
              ) : (
                <p className="font-semibold text-slate-800">{payment.account.name}</p>
              )}
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
                  {payment.invoicePayments.map((ip) => {
                    const totalPaid = ip.invoice.payments.reduce((sum, p) => sum + p.amount, 0)
                    const remaining = Math.max(0, ip.invoice.totalAmount - totalPaid)
                    return (
                      <TableRow key={ip.id}>
                        <TableCell className="font-semibold">
                          <Link href={`/penjualan/${ip.invoice.id}`} className="hover:underline">
                            {ip.invoice.invoiceNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{formatRupiah(ip.invoice.totalAmount)}</TableCell>
                        <TableCell className="font-semibold">
                          {payment.postStatus === "draft" ? (
                            <EditableInvoicePaymentAmount paymentId={payment.id} invoicePaymentId={ip.id} amount={ip.amount} />
                          ) : (
                            formatRupiah(ip.amount)
                          )}
                          {remaining > 0 && <p className="text-xs font-semibold text-rose-700 mt-0.5">Kurang bayar {formatRupiah(remaining)}</p>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </div>

          <PaymentCostSection
            paymentId={payment.id}
            costTransactions={costTransactions}
            canEdit={canEditCosts}
            domains={domains.map((d) => ({ id: d.id, name: d.name, price: d.sellPrice, clientName: d.client?.name ?? null }))}
            servers={servers.map((s) => ({ id: s.id, name: s.name, price: s.price, clientName: s.client?.name ?? null }))}
            maintenances={maintenances.map((m) => ({ id: m.id, name: m.name, price: m.price, clientName: m.client?.name ?? null }))}
          />

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

          <div className="mt-4 pt-4 border-t border-slate-200/60">
            <AuditTrail
              createdByName={payment.createdById ? (userNames.get(payment.createdById) ?? null) : null}
              postedByName={payment.postedById ? (userNames.get(payment.postedById) ?? null) : null}
              postedAt={payment.postedAt ? payment.postedAt.toISOString() : null}
              voidedByName={payment.voidedById ? (userNames.get(payment.voidedById) ?? null) : null}
              voidedAt={payment.voidedAt ? payment.voidedAt.toISOString() : null}
              voidReason={payment.voidReason}
            />
          </div>
        </Card>

        {/* Cuma tampil saat print (lihat .print-only di globals.css) — format kwitansi sesuai
           referensi "Kwitansi Keren" (nota/Kwitansi Keren.png), tidak pernah dilihat staf di layar. */}
        <KwitansiPrintable payment={payment} receiverName={user.name} date={formatDate(payment.paidAt)} qrDataUrl={qrDataUrl} isFullyPaid={isFullyPaid} />
      </div>
    </AppLayout>
  )
}
