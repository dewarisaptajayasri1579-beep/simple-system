import { Card, CardDescription } from "@/components/ui"
import { Globe, FileWarning, CheckCircle2, Clock } from "lucide-react"

export const DomainSummaryCards: React.FC<{
  total: number
  belumTagih: number
  sudahDitagih: number
  belumBayar: number
  trend: { label: string; count: number }[]
}> = ({ total, belumTagih, sudahDitagih, belumBayar, trend }) => {
  const maxTrend = Math.max(1, ...trend.map((t) => t.count))

  return (
    <Card variant="panel" padding="lg" className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card variant="feature" padding="sm">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-700 flex items-center justify-center flex-shrink-0"><Globe className="w-4 h-4" /></span>
            <CardDescription className="font-bold text-slate-600">Total Domain</CardDescription>
          </div>
          <p className="text-xl font-black text-slate-900 mt-2">{total}</p>
        </Card>
        <Card variant="feature" padding="sm">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0"><FileWarning className="w-4 h-4" /></span>
            <CardDescription className="font-bold text-slate-600">Belum Tagih</CardDescription>
          </div>
          <p className="text-xl font-black text-amber-700 mt-2">{belumTagih}</p>
        </Card>
        <Card variant="feature" padding="sm">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-700 flex items-center justify-center flex-shrink-0"><CheckCircle2 className="w-4 h-4" /></span>
            <CardDescription className="font-bold text-slate-600">Sudah Ditagih</CardDescription>
          </div>
          <p className="text-xl font-black text-sky-700 mt-2">{sudahDitagih}</p>
        </Card>
        <Card variant="feature" padding="sm">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-700 flex items-center justify-center flex-shrink-0"><Clock className="w-4 h-4" /></span>
            <CardDescription className="font-bold text-slate-600">Belum Bayar</CardDescription>
          </div>
          <p className="text-xl font-black text-rose-700 mt-2">{belumBayar}</p>
        </Card>
      </div>

      <div>
        <div className="mb-3">
          <p className="text-sm font-bold text-slate-800">Distribusi Jatuh Tempo Domain</p>
          <p className="text-[11px] text-slate-500 font-medium">Jumlah domain yang renewal-nya jatuh di tiap bulan, 12 bulan ke depan.</p>
        </div>
        <div className="flex items-end gap-1.5 sm:gap-2.5 h-32 overflow-x-auto pb-1">
          {trend.map((t) => (
            <div key={t.label} className="flex flex-col items-center gap-1.5 flex-1 min-w-[36px]">
              <span className="text-[10px] font-bold text-slate-600">{t.count > 0 ? t.count : ""}</span>
              <div className="w-full max-w-[28px] rounded-t-md bg-sky-300" style={{ height: `${Math.max(4, (t.count / maxTrend) * 96)}px` }} />
              <span className="text-[9px] text-slate-500 font-semibold whitespace-nowrap">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
