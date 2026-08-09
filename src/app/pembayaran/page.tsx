import { AppLayout } from "@/components/layout/AppLayout"
import { PembayaranForm } from "@/components/pembayaran/PembayaranForm"
import { PaymentHistoryTable } from "@/components/pembayaran/PaymentHistoryTable"
import { Card, CardTitle, CardDescription } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function PembayaranPage({ searchParams }: { searchParams: Promise<{ clientId?: string; invoiceId?: string }> }) {
  const user = await getCurrentUser()
  const params = await searchParams

  const [clients, recentPayments] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.payment.findMany({
      include: { client: true, invoicePayments: { include: { invoice: { select: { invoiceNumber: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pembayaran</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Catat pelunasan piutang — bisa gabung beberapa invoice dalam satu kwitansi.</p>
        </div>

        <PembayaranForm clients={clients} userRole={user.role} prefillClientId={params.clientId} prefillInvoiceId={params.invoiceId} />

        {recentPayments.length > 0 && (
          <Card variant="panel" padding="none">
            <div className="p-5 sm:p-6">
              <CardTitle>Riwayat Pembayaran</CardTitle>
              <CardDescription>{recentPayments.length} kwitansi pembayaran.</CardDescription>
            </div>
            <PaymentHistoryTable
              rows={recentPayments.map((p) => ({
                id: p.id,
                paymentNumber: p.paymentNumber,
                paidAt: p.paidAt.toISOString(),
                clientName: p.client.name,
                totalAmount: p.totalAmount,
                postStatus: p.postStatus as "draft" | "posted" | "voided",
                invoiceNumbers: p.invoicePayments.map((ip) => ip.invoice.invoiceNumber),
              }))}
            />
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
