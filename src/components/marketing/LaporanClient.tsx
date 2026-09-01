"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { Alert, Card, Input, Select, SkeletonList, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui"
import { FilterPills, MktHeader } from "./ui"

function rpShort(n: number): string {
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`
  if (n >= 1_000_000) return `Rp${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
  if (n >= 1_000) return `Rp${(n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`
  return `Rp${n.toLocaleString("id-ID")}`
}

/** 1 baris label + bar proporsional + angka — dipakai buat semua ranking/distribusi/funnel di
 *  ketiga tab, pola sama seperti funnel bar yang sudah ada di ManagerDashboard.tsx. */
const RankBar: React.FC<{ label: string; value: number; max: number; suffix?: string; colorClass?: string }> = ({
  label,
  value,
  max,
  suffix = "",
  colorClass = "from-[#0544cc] to-[#2563eb]",
}) => (
  <div className="flex items-center gap-3">
    <span className="text-xs font-bold text-slate-500 w-32 flex-shrink-0 truncate" title={label}>{label}</span>
    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
      <div className={`h-full bg-gradient-to-r ${colorClass} rounded-full`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
    <span className="text-xs font-bold text-slate-700 w-16 text-right flex-shrink-0">
      {value}
      {suffix}
    </span>
  </div>
)

type Opt = { id: string; name: string }
type Tab = "volume" | "kualitas" | "performa-sales"

interface VolumeData {
  trend: { date: string; count: number }[]
  salesNames: Opt[]
  segmentNames: Opt[]
  bySalesByDate: { date: string; cells: Record<string, number>; total: number }[]
  bySegmentByDate: { date: string; cells: Record<string, number>; total: number }[]
  bySource: { sourceId: string; name: string; count: number }[]
  totalLeads: number
}

interface QualityData {
  totalCohort: number
  priorityDistribution: { level: string; count: number }[]
  temperatureDistribution: { temperature: string; count: number }[]
  funnel: { stage: string; label: string; count: number; pctOfTotal: number | null; dropOffPct: number | null }[]
  outcome: { open: number; won: number; lost: number }
  lostReasons: { name: string; count: number }[]
}

interface SalesPerfRow {
  userId: string
  name: string
  leads: number
  won: number
  lost: number
  winRate: number | null
  avgDealValue: number | null
  followUpOnTimeRate: number | null
  avgResponseMinutes: number | null
  activityCount: number
}

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

export const LaporanClient: React.FC = () => {
  const [tab, setTab] = useState<Tab>("volume")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [salesId, setSalesId] = useState("")
  const [segmentId, setSegmentId] = useState("")
  const [sourceId, setSourceId] = useState("")
  const [salesOpts, setSalesOpts] = useState<Opt[]>([])
  const [segmentOpts, setSegmentOpts] = useState<Opt[]>([])
  const [sourceOpts, setSourceOpts] = useState<Opt[]>([])
  const [error, setError] = useState<string | null>(null)

  const [volume, setVolume] = useState<VolumeData | null>(null)
  const [quality, setQuality] = useState<QualityData | null>(null)
  const [salesPerf, setSalesPerf] = useState<SalesPerfRow[] | null>(null)

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.users) setSalesOpts(d.users)
        if (d.segments) setSegmentOpts(d.segments)
        if (d.sources) setSourceOpts(d.sources)
      })
      .catch(() => {})
  }, [])

  const query = useCallback(() => {
    const p = new URLSearchParams()
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (salesId) p.set("salesId", salesId)
    if (segmentId) p.set("segmentId", segmentId)
    if (sourceId) p.set("sourceId", sourceId)
    return p.toString()
  }, [from, to, salesId, segmentId, sourceId])

  const load = useCallback(async () => {
    setError(null)
    try {
      if (tab === "volume") {
        const res = await fetch(`/api/marketing/reports/volume?${query()}`, { cache: "no-store" })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || "Gagal memuat laporan")
        setVolume(d)
        if (!from) setFrom(d.filters.from)
        if (!to) setTo(d.filters.to)
      } else if (tab === "kualitas") {
        const res = await fetch(`/api/marketing/reports/quality?${query()}`, { cache: "no-store" })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || "Gagal memuat laporan")
        setQuality(d)
        if (!from) setFrom(d.filters.from)
        if (!to) setTo(d.filters.to)
      } else {
        const res = await fetch(`/api/marketing/reports/sales-performance?${query()}`, { cache: "no-store" })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || "Gagal memuat laporan")
        setSalesPerf(d.rows)
        if (!from) setFrom(d.filters.from)
        if (!to) setTo(d.filters.to)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat laporan")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-6">
      <MktHeader title="Laporan" />

      <Card variant="feature" padding="md" className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Input type="date" label="Dari" value={from} onChange={(e) => setFrom(e.target.value)} sizeVariant="sm" />
        </div>
        <div className="w-40">
          <Input type="date" label="Sampai" value={to} onChange={(e) => setTo(e.target.value)} sizeVariant="sm" />
        </div>
        <div className="w-44">
          <label className="text-xs sm:text-sm font-bold text-slate-700">Sales</label>
          <div className="mt-1.5">
            <Select
              options={[{ value: "", label: "Semua Sales" }, ...salesOpts.map((s) => ({ value: s.id, label: s.name }))]}
              value={salesId}
              onChange={setSalesId}
              sizeVariant="sm"
            />
          </div>
        </div>
        <div className="w-44">
          <label className="text-xs sm:text-sm font-bold text-slate-700">Segmen</label>
          <div className="mt-1.5">
            <Select
              options={[{ value: "", label: "Semua Segmen" }, ...segmentOpts.map((s) => ({ value: s.id, label: s.name }))]}
              value={segmentId}
              onChange={setSegmentId}
              sizeVariant="sm"
            />
          </div>
        </div>
        <div className="w-44">
          <label className="text-xs sm:text-sm font-bold text-slate-700">Sumber</label>
          <div className="mt-1.5">
            <Select
              options={[{ value: "", label: "Semua Sumber" }, ...sourceOpts.map((s) => ({ value: s.id, label: s.name }))]}
              value={sourceId}
              onChange={setSourceId}
              sizeVariant="sm"
            />
          </div>
        </div>
        {(salesId || segmentId || sourceId) && (
          <button
            onClick={() => {
              setSalesId("")
              setSegmentId("")
              setSourceId("")
            }}
            className="text-xs font-bold text-blue-700 pb-2"
          >
            Reset filter
          </button>
        )}
      </Card>

      <FilterPills
        options={[
          { key: "volume", label: "Volume" },
          { key: "kualitas", label: "Kualitas Lead" },
          { key: "performa-sales", label: "Performa Sales" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {error && <Alert variant="error">{error}</Alert>}

      {tab === "volume" && (volume ? <VolumeTab data={volume} fmtDate={fmtDate} /> : <SkeletonList rows={6} />)}
      {tab === "kualitas" && (quality ? <QualityTab data={quality} /> : <SkeletonList rows={6} />)}
      {tab === "performa-sales" && (salesPerf ? <SalesPerfTab rows={salesPerf} /> : <SkeletonList rows={6} />)}
    </div>
  )
}

const VolumeTab: React.FC<{ data: VolumeData; fmtDate: (iso: string) => string }> = ({ data, fmtDate }) => {
  const trendMax = Math.max(1, ...data.trend.map((t) => t.count))
  const sourceMax = Math.max(1, ...data.bySource.map((s) => s.count))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">
          Trend Lead Masuk Harian — Total {data.totalLeads}
        </h2>
        <Card variant="feature" padding="md" className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
          {data.trend.length === 0 && <p className="text-sm text-slate-400">Belum ada lead pada rentang ini.</p>}
          {data.trend.map((t) => <RankBar key={t.date} label={fmtDate(t.date)} value={t.count} max={trendMax} />)}
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Lead Masuk per Sumber</h2>
        <Card variant="feature" padding="md" className="flex flex-col gap-1.5">
          {data.bySource.length === 0 && <p className="text-sm text-slate-400">Belum ada data.</p>}
          {data.bySource.map((s) => (
            <RankBar key={s.sourceId} label={s.name} value={s.count} max={sourceMax} colorClass="from-emerald-600 to-emerald-400" />
          ))}
        </Card>
      </div>

      <PivotTable title="Lead Masuk per Sales per Tanggal" dims={data.salesNames} rows={data.bySalesByDate} fmtDate={fmtDate} />
      <PivotTable title="Lead Masuk per Segmen per Tanggal" dims={data.segmentNames} rows={data.bySegmentByDate} fmtDate={fmtDate} />
    </div>
  )
}

const PivotTable: React.FC<{
  title: string
  dims: Opt[]
  rows: { date: string; cells: Record<string, number>; total: number }[]
  fmtDate: (iso: string) => string
}> = ({ title, dims, rows, fmtDate }) => (
  <div>
    <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">{title}</h2>
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal</TableHead>
            {dims.map((d) => <TableHead key={d.id} className="text-right">{d.name}</TableHead>)}
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={dims.length + 2} className="text-sm text-slate-400">Belum ada data.</TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.date}>
              <TableCell className="font-bold text-slate-800">{fmtDate(r.date)}</TableCell>
              {dims.map((d) => <TableCell key={d.id} className="text-right">{r.cells[d.id] || ""}</TableCell>)}
              <TableCell className="text-right font-bold">{r.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </div>
)

const PRIORITY_COLOR: Record<string, string> = {
  TOP: "from-rose-600 to-rose-400",
  HIGH: "from-amber-600 to-amber-400",
  MONITOR: "from-blue-600 to-blue-400",
  LOW: "from-slate-500 to-slate-400",
}
const TEMP_LABEL: Record<string, string> = { HOT: "Hot", WARM: "Warm", COLD: "Cold" }
const TEMP_COLOR: Record<string, string> = {
  HOT: "from-rose-600 to-rose-400",
  WARM: "from-amber-600 to-amber-400",
  COLD: "from-slate-500 to-slate-400",
}

const QualityTab: React.FC<{ data: QualityData }> = ({ data }) => {
  const prMax = Math.max(1, ...data.priorityDistribution.map((p) => p.count))
  const tempMax = Math.max(1, ...data.temperatureDistribution.map((t) => t.count))
  const funnelMax = Math.max(1, data.totalCohort)
  const reasonMax = Math.max(1, ...data.lostReasons.map((r) => r.count))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-2.5">
        <Card variant="feature" padding="md">
          <p className="text-xs font-bold text-slate-500">Total Lead (cohort)</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{data.totalCohort}</p>
        </Card>
        <Card variant="feature" padding="md">
          <p className="text-xs font-bold text-slate-500">Won</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{data.outcome.won}</p>
        </Card>
        <Card variant="feature" padding="md">
          <p className="text-xs font-bold text-slate-500">Lost</p>
          <p className="text-2xl font-black text-slate-500 mt-1">{data.outcome.lost}</p>
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Distribusi Scoring (Priority Level)</h2>
        <Card variant="feature" padding="md" className="flex flex-col gap-1.5">
          {data.priorityDistribution.map((p) => (
            <RankBar key={p.level} label={p.level} value={p.count} max={prMax} colorClass={PRIORITY_COLOR[p.level]} />
          ))}
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Distribusi Temperature</h2>
        <Card variant="feature" padding="md" className="flex flex-col gap-1.5">
          {data.temperatureDistribution.map((t) => (
            <RankBar
              key={t.temperature}
              label={TEMP_LABEL[t.temperature] ?? t.temperature}
              value={t.count}
              max={tempMax}
              colorClass={TEMP_COLOR[t.temperature]}
            />
          ))}
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Funnel Tahap (% dari total, drop-off tiap tahap)</h2>
        <Card variant="feature" padding="md" className="flex flex-col gap-2">
          {data.funnel.map((f) => (
            <div key={f.stage} className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 w-32 flex-shrink-0">{f.label}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#0544cc] to-[#2563eb] rounded-full" style={{ width: `${(f.count / funnelMax) * 100}%` }} />
              </div>
              <span className="text-xs font-bold text-slate-700 w-14 text-right">
                {f.count} ({f.pctOfTotal ?? 0}%)
              </span>
              <span className="text-[11px] text-amber-600 w-24 text-right flex-shrink-0">
                {f.dropOffPct != null ? `drop ${f.dropOffPct}%` : ""}
              </span>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Alasan Lost (semua)</h2>
        <Card variant="feature" padding="md" className="flex flex-col gap-1.5">
          {data.lostReasons.length === 0 && <p className="text-sm text-slate-400">Belum ada lead Lost pada rentang ini.</p>}
          {data.lostReasons.map((r) => (
            <RankBar key={r.name} label={r.name} value={r.count} max={reasonMax} colorClass="from-slate-600 to-slate-400" />
          ))}
        </Card>
      </div>
    </div>
  )
}

const SalesPerfTab: React.FC<{ rows: SalesPerfRow[] }> = ({ rows }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Scorecard Sales</h2>
      <Link href="/marketing/analitik?tab=dashboard" className="text-xs font-bold text-blue-700">Performa Segmen/Kemampuan Beli → Dashboard</Link>
    </div>
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sales</TableHead>
            <TableHead className="text-right">Lead</TableHead>
            <TableHead className="text-right">Won</TableHead>
            <TableHead className="text-right">Lost</TableHead>
            <TableHead className="text-right">Win Rate</TableHead>
            <TableHead className="text-right">Avg Deal</TableHead>
            <TableHead className="text-right">On-Time FU</TableHead>
            <TableHead className="text-right">Avg Respons</TableHead>
            <TableHead className="text-right">Aktivitas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-sm text-slate-400">Belum ada data.</TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.userId}>
              <TableCell>
                <Link href={`/marketing/tim/${r.userId}`} className="font-bold text-slate-800 hover:text-blue-700">{r.name}</Link>
              </TableCell>
              <TableCell className="text-right">{r.leads}</TableCell>
              <TableCell className="text-right text-emerald-600 font-bold">{r.won || ""}</TableCell>
              <TableCell className="text-right text-slate-500">{r.lost || ""}</TableCell>
              <TableCell className="text-right">{r.winRate == null ? "—" : `${r.winRate}%`}</TableCell>
              <TableCell className="text-right text-slate-600">{r.avgDealValue == null ? "—" : rpShort(r.avgDealValue)}</TableCell>
              <TableCell className="text-right">{r.followUpOnTimeRate == null ? "—" : `${r.followUpOnTimeRate}%`}</TableCell>
              <TableCell className="text-right">{r.avgResponseMinutes == null ? "—" : `${r.avgResponseMinutes}m`}</TableCell>
              <TableCell className="text-right">{r.activityCount || ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  </div>
)
