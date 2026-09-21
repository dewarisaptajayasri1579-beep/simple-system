"use client"

import { useMemo, useState } from "react"
import { Card, CardTitle, CardDescription, Badge, Input } from "@/components/ui"
import { Globe, FileWarning, CheckCircle2, Clock, Search, ChevronDown } from "lucide-react"

export interface DomainRekapRow {
  id: string
  name: string
  ownerLabel: string
  price: number | null
  dueDate: string | null
  status: "aktif" | "belum_ditagih" | "sudah_ditagih" | "belum_bayar"
  sortWeight: number
}

const STATUS_META: Record<DomainRekapRow["status"], { label: string; variant: "success" | "warning" | "info" | "danger" }> = {
  aktif: { label: "Aktif", variant: "success" },
  belum_ditagih: { label: "Belum Ditagih", variant: "warning" },
  sudah_ditagih: { label: "Sudah Ditagih", variant: "info" },
  belum_bayar: { label: "Belum Dibayar", variant: "danger" },
}

function formatRupiah(amount: number | null) {
  if (!amount) return "Rp 0"
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function formatDate(iso: string | null) {
  if (!iso) return "Belum ada tanggal"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

const PAGE_SIZE = 5

export const DomainRekapSection: React.FC<{
  rows: DomainRekapRow[]
  total: number
  belumTagih: number
  sudahDitagih: number
  belumBayar: number
  trend: { label: string; count: number }[]
}> = ({ rows, total, belumTagih, sudahDitagih, belumBayar, trend }) => {
  const [query, setQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.ownerLabel.toLowerCase().includes(q))
  }, [rows, query])

  const visibleRows = filtered.slice(0, visibleCount)
  const remaining = filtered.length - visibleRows.length
  const maxTrend = Math.max(1, ...trend.map((t) => t.count))

  return (
    <Card variant="panel" padding="lg" className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-2xl bg-sky-500/15 text-sky-700 flex items-center justify-center flex-shrink-0">
          <Globe className="w-5 h-5" />
        </span>
        <div>
          <CardTitle>Domain</CardTitle>
          <CardDescription className="mt-0.5">{total} domain aktif yang dikelola</CardDescription>
        </div>
      </div>

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
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Distribusi Jatuh Tempo Domain</p>
            <p className="text-[11px] text-slate-500 font-medium">Jumlah domain yang renewal-nya jatuh di tiap bulan, 12 bulan ke depan.</p>
          </div>
        </div>
        <div className="flex items-end gap-1.5 sm:gap-2.5 h-32 overflow-x-auto pb-1">
          {trend.map((t) => (
            <div key={t.label} className="flex flex-col items-center gap-1.5 flex-1 min-w-[36px]">
              <span className="text-[10px] font-bold text-slate-600">{t.count > 0 ? t.count : ""}</span>
              <div
                className="w-full max-w-[28px] rounded-t-md bg-sky-300"
                style={{ height: `${Math.max(4, (t.count / maxTrend) * 96)}px` }}
              />
              <span className="text-[9px] text-slate-500 font-semibold whitespace-nowrap">{t.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Daftar Domain</p>
            <p className="text-[11px] text-slate-500 font-medium">Urutkan berdasarkan prioritas penagihan</p>
          </div>
          <div className="w-full sm:w-64">
            <Input
              sizeVariant="sm"
              placeholder="Cari domain atau client..."
              leftIcon={<Search className="w-4 h-4" />}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setVisibleCount(PAGE_SIZE)
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {visibleRows.length === 0 && <p className="text-sm text-slate-500 font-medium py-6 text-center">Tidak ada domain yang cocok.</p>}
          {visibleRows.map((r) => {
            const meta = STATUS_META[r.status]
            return (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/60 border border-slate-200/70">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{r.name}</p>
                  <p className="text-[11px] text-slate-500 font-medium truncate">{r.ownerLabel}</p>
                </div>
                <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                <p className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">Jatuh tempo {formatDate(r.dueDate)}</p>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">{formatRupiah(r.price)}</p>
                  <p className="text-[10px] text-slate-400 font-semibold">/ tahun</p>
                </div>
              </div>
            )
          })}
        </div>

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="w-full mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors"
          >
            Lihat {remaining} domain lainnya <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </Card>
  )
}
