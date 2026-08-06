import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui"
import { PeriodFilter } from "@/components/laporan/PeriodFilter"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveReportPeriod } from "@/lib/report-period"
import { accountMovement } from "@/lib/accounting/coa-balance"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

export default async function LabaRugiAkrualPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePageRole(["owner", "direktur"])
  const params = await searchParams
  const period = resolveReportPeriod(params)

  const lines = await prisma.journalLine.findMany({
    where: {
      account: { type: { in: ["revenue", "cogs", "expense"] } },
      journalEntry: { date: { gte: period.from, lte: period.to } },
    },
    include: { account: true },
  })

  const sumByType = (type: string) =>
    lines.filter((l) => l.account.type === type).reduce((s, l) => s + accountMovement(type, l.debit, l.credit), 0)

  const pendapatan = sumByType("revenue")
  const hpp = sumByType("cogs")
  const labaKotor = pendapatan - hpp
  const beban = sumByType("expense")
  const labaBersih = labaKotor - beban

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Laba Rugi (Akrual)</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Periode {period.fromIso} s/d {period.toIso} (accrual)</p>
          </div>
          <PeriodFilter fromIso={period.fromIso} toIso={period.toIso} />
        </div>

        <Card variant="panel" padding="lg">
          <CardHeader>
            <CardTitle>Ringkasan</CardTitle>
            <CardDescription>Dihitung dari Jurnal Umum — pendapatan diakui saat invoice terbit, bukan saat dibayar.</CardDescription>
          </CardHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Pendapatan</span>
              <span className="font-semibold">{formatRupiah(pendapatan)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Dikurangi HPP</span>
              <span className="font-semibold text-rose-700">- {formatRupiah(hpp)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200/60">
              <span>Laba Kotor</span>
              <span>{formatRupiah(labaKotor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Dikurangi Beban Operasional</span>
              <span className="font-semibold text-rose-700">- {formatRupiah(beban)}</span>
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
