import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { PembayaranForm } from "@/components/pembayaran/PembayaranForm"
import { Card, CardTitle, CardDescription, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

export default async function PembayaranPage({ searchParams }: { searchParams: Promise<{ clientId?: string; invoiceId?: string }> }) {
  const user = await getCurrentUser()
  const params = await searchParams

  const [clients, recentPayments] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.payment.findMany({
      include: { client: true, invoicePayments: true },
      orderBy: { paidAt: "desc" },
      take: 20,
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
              <CardDescription>20 kwitansi pembayaran terbaru.</CardDescription>
            </div>
            <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Kwitansi</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Invoice Dilunasi</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold">
                        <Link href={`/pembayaran/${p.id}`} className="hover:underline">
                          {p.paymentNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(p.paidAt)}</TableCell>
                      <TableCell>{p.client.name}</TableCell>
                      <TableCell>{p.invoicePayments.length} invoice</TableCell>
                      <TableCell className="font-semibold">{formatRupiah(p.totalAmount)}</TableCell>
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
