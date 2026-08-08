import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui"
import { PeriodFilter } from "@/components/laporan/PeriodFilter"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveReportPeriod } from "@/lib/report-period"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

export default async function LabaRugiPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePageRole(["owner", "direktur"])
  const params = await searchParams
  const period = resolveReportPeriod(params)

  const transactions = await prisma.transaction.findMany({
    where: { occurredAt: { gte: period.from, lte: period.to }, postStatus: "posted" },
  })

  const income = transactions.filter((t) => t.type === "income")
  const expense = transactions.filter((t) => t.type === "expense")

  const pendapatanKotor = income.reduce((s, t) => s + t.grossAmount, 0)
  const potonganHppPpn = income.reduce((s, t) => s + t.cost, 0)
  const pendapatanBersih = pendapatanKotor - potonganHppPpn
  const biayaOperasional = expense.reduce((s, t) => s + t.grossAmount, 0)
  const labaBersih = pendapatanBersih - biayaOperasional

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Laba Rugi</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Periode {period.fromIso} s/d {period.toIso} (cash-basis)</p>
          </div>
          <PeriodFilter fromIso={period.fromIso} toIso={period.toIso} />
        </div>

        <Card variant="panel" padding="lg">
          <CardHeader>
            <CardTitle>Ringkasan</CardTitle>
            <CardDescription>Dihitung dari transaksi kas/bank yang benar-benar tercatat (bukan akrual).</CardDescription>
          </CardHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Pendapatan Kotor</span>
              <span className="font-semibold">{formatRupiah(pendapatanKotor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Dikurangi HPP + PPN</span>
              <span className="font-semibold text-rose-700">- {formatRupiah(potonganHppPpn)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200/60">
              <span>Pendapatan Bersih</span>
              <span>{formatRupiah(pendapatanBersih)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Dikurangi Biaya Operasional</span>
              <span className="font-semibold text-rose-700">- {formatRupiah(biayaOperasional)}</span>
            </div>
            <div className="flex justify-between text-lg font-black pt-3 border-t-2 border-slate-300">
              <span>Laba Bersih</span>
              <span className={labaBersih >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatRupiah(labaBersih)}</span>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
