import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui"
import { PeriodFilter } from "@/components/laporan/PeriodFilter"
import { ClientSalesTable } from "@/components/laporan/ClientSalesTable"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveReportPeriod } from "@/lib/report-period"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

export default async function LaporanPenjualanPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  // Laporan keuangan — Owner+Direktur saja (role "admin" tidak boleh lihat angka pembukuan).
  const user = await requirePageRole(["owner", "direktur"])
  const params = await searchParams
  const period = resolveReportPeriod(params)

  const invoices = await prisma.invoice.findMany({
    where: { issuedAt: { gte: period.from, lte: period.to }, postStatus: "posted" },
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
    orderBy: { issuedAt: "desc" },
  })

  const totalInvoiced = invoices.reduce((sum, i) => sum + i.totalAmount, 0)
  const totalCollected = invoices.reduce((sum, i) => sum + i.payments.reduce((s, p) => s + p.amount, 0), 0)
  const totalOutstanding = totalInvoiced - totalCollected
  // Laporan ini SENGAJA tetap menghitung invoice yang ditandai Pending/Ragu-Ragu — penjualannya
  // memang terjadi, jadi Total Invoice Terbit tidak boleh berubah gara-gara penandaan itu (dan
  // Terbit = Tertagih + Outstanding harus tetap balance). Porsinya ditulis terpisah di bawah
  // kartu Outstanding supaya angkanya bisa dicocokkan dengan Piutang Outstanding di Dashboard
  // (yang sudah mengeluarkan kedua flag itu — lihat menu Tagihan > Piutang Ragu-Ragu).
  const doubtfulOutstanding = invoices
    .filter((i) => i.doubtfulAt || i.pendingAt)
    .reduce((sum, i) => sum + (i.totalAmount - i.payments.reduce((s, p) => s + p.amount, 0)), 0)

  const byClient = new Map<string, { name: string; total: number; collected: number }>()
  for (const inv of invoices) {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    const row = byClient.get(inv.clientId) ?? { name: inv.client.name, total: 0, collected: 0 }
    row.total += inv.totalAmount
    row.collected += paid
    byClient.set(inv.clientId, row)
  }
  const clientRows = Array.from(byClient.values()).sort((a, b) => b.total - a.total)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Laporan Penjualan</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Periode {period.fromIso} s/d {period.toIso}</p>
          </div>
          <PeriodFilter fromIso={period.fromIso} toIso={period.toIso} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card variant="feature" padding="md">
            <CardDescription>Total Invoice Terbit</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">{formatRupiah(totalInvoiced)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Total Tertagih</CardDescription>
            <p className="text-2xl font-black text-emerald-700 mt-1">{formatRupiah(totalCollected)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Outstanding</CardDescription>
            <p className="text-2xl font-black text-rose-700 mt-1">{formatRupiah(totalOutstanding)}</p>
            {doubtfulOutstanding > 0 && (
              <p className="text-[11px] font-bold text-amber-700 mt-1">
                termasuk {formatRupiah(doubtfulOutstanding)} Piutang Ragu-Ragu
              </p>
            )}
          </Card>
        </div>

        <Card variant="panel" padding="none">
          <CardHeader className="p-5 sm:p-6 mb-0">
            <CardTitle>Per Client</CardTitle>
            <CardDescription>{invoices.length} invoice pada periode ini</CardDescription>
          </CardHeader>
          <ClientSalesTable rows={clientRows} />
        </Card>
      </div>
    </AppLayout>
  )
}
