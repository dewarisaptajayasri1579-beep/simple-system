import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription, Button } from "@/components/ui"
import { PeriodFilter } from "@/components/laporan/PeriodFilter"
import { CategoryBreakdownTable } from "@/components/laporan/CategoryBreakdownTable"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveReportPeriod } from "@/lib/report-period"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

export default async function LaporanKeuanganPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await getCurrentUser()
  const params = await searchParams
  const period = resolveReportPeriod(params)
  const canSeeSplit = user.role === "owner" || user.role === "direktur"

  const transactions = await prisma.transaction.findMany({
    where: { occurredAt: { gte: period.from, lte: period.to }, postStatus: "posted" },
    include: { category: true },
  })

  const income = transactions.filter((t) => t.type === "income")
  const expense = transactions.filter((t) => t.type === "expense")

  const totalIncomeGross = income.reduce((s, t) => s + t.grossAmount, 0)
  const totalIncomeNet = income.reduce((s, t) => s + t.netAmount, 0)
  const totalExpense = expense.reduce((s, t) => s + t.grossAmount, 0)
  const totalOperasional = income.reduce((s, t) => s + (t.operasionalAmount ?? 0), 0)
  const totalDireksi = income.reduce((s, t) => s + (t.direksiAmount ?? 0), 0)
  const totalBonus = income.reduce((s, t) => s + (t.bonusAmount ?? 0), 0)

  const byCategory = new Map<string, { name: string; kind: string; total: number }>()
  for (const t of transactions) {
    const key = `${t.type}:${t.category?.name ?? "(tanpa kategori)"}`
    const row = byCategory.get(key) ?? { name: t.category?.name ?? "(tanpa kategori)", kind: t.type, total: 0 }
    row.total += t.type === "income" ? t.netAmount : t.grossAmount
    byCategory.set(key, row)
  }
  const categoryRows = Array.from(byCategory.values()).sort((a, b) => b.total - a.total)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Laporan Keuangan</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Periode {period.fromIso} s/d {period.toIso}</p>
          </div>
          <PeriodFilter fromIso={period.fromIso} toIso={period.toIso} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card variant="feature" padding="md">
            <CardDescription>Pemasukan (Gross)</CardDescription>
            <p className="text-2xl font-black text-emerald-700 mt-1">{formatRupiah(totalIncomeGross)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Pengeluaran</CardDescription>
            <p className="text-2xl font-black text-rose-700 mt-1">{formatRupiah(totalExpense)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Pemasukan Bersih (setelah HPP/PPN)</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">{formatRupiah(totalIncomeNet)}</p>
          </Card>
        </div>

        {canSeeSplit && (
          <Card variant="panel" padding="lg">
            <CardHeader>
              <CardTitle>Pembagian Uang Masuk (periode ini)</CardTitle>
              <CardDescription>Dari pemasukan bersih setelah HPP/PPN dipotong.</CardDescription>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
                <p className="text-xs font-bold text-sky-700 uppercase">Operasional</p>
                <p className="text-xl font-black text-sky-900 mt-1">{formatRupiah(totalOperasional)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
                <p className="text-xs font-bold text-indigo-700 uppercase">Direksi</p>
                <p className="text-xl font-black text-indigo-900 mt-1">{formatRupiah(totalDireksi)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <p className="text-xs font-bold text-amber-700 uppercase">Bonus</p>
                <p className="text-xl font-black text-amber-900 mt-1">{formatRupiah(totalBonus)}</p>
              </div>
            </div>
          </Card>
        )}

        <Card variant="panel" padding="none">
          <CardHeader className="p-5 sm:p-6 mb-0">
            <CardTitle>Per Kategori</CardTitle>
          </CardHeader>
          <CategoryBreakdownTable rows={categoryRows} />
        </Card>

        {canSeeSplit && (
          <div className="flex gap-3">
            <Link href="/laporan/neraca">
              <Button variant="outline" size="sm">Lihat Neraca</Button>
            </Link>
            <Link href="/laporan/laba-rugi">
              <Button variant="outline" size="sm">Lihat Laba Rugi</Button>
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
