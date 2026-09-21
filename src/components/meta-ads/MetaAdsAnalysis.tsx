"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { TrendingUp, Users } from "lucide-react"

import { Alert, Card, Select, Spinner } from "@/components/ui"

type MetaAdsDailyPoint = { date: string; spend: number; impressions: number; clicks: number; ctr: number; cpc: number }
type MetaAdsBreakdownRow = { label: string; spend: number; impressions: number; clicks: number; ctr: number; cpc: number }
type MetaAdsBreakdownDimension = "age" | "gender" | "region" | "placement"

type InsightsResponse = { range: string; dimension: MetaAdsBreakdownDimension; trend: MetaAdsDailyPoint[]; breakdown: MetaAdsBreakdownRow[] }

const DIMENSION_OPTIONS: { value: MetaAdsBreakdownDimension; label: string }[] = [
  { value: "age", label: "Usia" },
  { value: "gender", label: "Gender" },
  { value: "region", label: "Wilayah" },
  { value: "placement", label: "Penempatan Iklan" },
]

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString("id-ID")}`
  }
}

function formatDateShort(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
}

const CHART_BLUE = "#2563eb"

function TrendChart({ points, currency }: { points: MetaAdsDailyPoint[]; currency: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const width = 720
  const height = 220
  const padL = 8
  const padR = 8
  const padT = 16
  const padB = 28
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const maxSpend = Math.max(...points.map((p) => p.spend), 1)
  const yTicks = [0, 0.5, 1].map((f) => Math.round(maxSpend * f))

  const xFor = (i: number) => padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW)
  const yFor = (spend: number) => padT + plotH - (spend / maxSpend) * plotH

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.spend).toFixed(1)}`).join(" ")
  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${padL} ${(padT + plotH).toFixed(1)} Z`

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || points.length === 0) return
    const rect = svg.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * width
    const ratio = points.length <= 1 ? 0 : Math.min(1, Math.max(0, (relX - padL) / plotW))
    const idx = Math.round(ratio * (points.length - 1))
    setHoverIndex(idx)
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null
  const last = points[points.length - 1]

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={yFor(v)} y2={yFor(v)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={padL} y={yFor(v) - 4} fontSize={10} fill="#94a3b8" fontWeight={600}>
              {v >= 1000 ? `${Math.round(v / 1000)}K` : v}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={CHART_BLUE} fillOpacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={CHART_BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {last && (
          <>
            <circle cx={xFor(points.length - 1)} cy={yFor(last.spend)} r={4} fill={CHART_BLUE} stroke="#fff" strokeWidth={2} />
            <text x={xFor(points.length - 1)} y={yFor(last.spend) - 10} fontSize={10} fontWeight={700} fill="#0f172a" textAnchor="end">
              {formatCurrency(last.spend, currency)}
            </text>
          </>
        )}

        {points.length > 0 && (
          <>
            <text x={xFor(0)} y={height - 8} fontSize={10} fill="#94a3b8" fontWeight={600} textAnchor="start">
              {formatDateShort(points[0].date)}
            </text>
            <text x={xFor(points.length - 1)} y={height - 8} fontSize={10} fill="#94a3b8" fontWeight={600} textAnchor="end">
              {formatDateShort(points[points.length - 1].date)}
            </text>
          </>
        )}

        {hovered && hoverIndex !== null && (
          <>
            <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={padT} y2={padT + plotH} stroke="#94a3b8" strokeWidth={1} />
            <circle cx={xFor(hoverIndex)} cy={yFor(hovered.spend)} r={4} fill={CHART_BLUE} stroke="#fff" strokeWidth={2} />
          </>
        )}
      </svg>

      {hovered && hoverIndex !== null && (
        <div
          className="absolute top-1 pointer-events-none bg-slate-900 text-white text-[11px] font-semibold rounded-lg px-2.5 py-2 shadow-lg space-y-0.5 z-10"
          style={{
            left: `${Math.min(78, Math.max(2, (xFor(hoverIndex) / width) * 100))}%`,
            transform: (xFor(hoverIndex) / width) * 100 > 78 ? "translateX(-100%)" : undefined,
          }}
        >
          <p className="text-slate-300">{formatDateShort(hovered.date)}</p>
          <p>Spend: {formatCurrency(hovered.spend, currency)}</p>
          <p>Klik: {hovered.clicks.toLocaleString("id-ID")}</p>
          <p>CTR: {hovered.ctr.toFixed(2)}%</p>
        </div>
      )}
    </div>
  )
}

function BreakdownTable({ rows, currency }: { rows: MetaAdsBreakdownRow[]; currency: string }) {
  const maxCtr = Math.max(...rows.map((r) => r.ctr), 0.01)

  if (rows.length === 0) {
    return <p className="p-6 text-sm text-slate-500 font-medium text-center">Tidak ada data segmen di rentang ini.</p>
  }

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row, i) => (
        <div key={row.label} className="px-4 sm:px-5 py-3 flex items-center gap-4">
          <div className="w-40 sm:w-48 flex-shrink-0 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-1.5">
              {row.label}
              {i === 0 && (
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md flex-shrink-0">
                  Terbaik
                </span>
              )}
            </p>
            <p className="text-[11px] text-slate-500 font-medium">{formatCurrency(row.spend, currency)} spend</p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${Math.max(4, (row.ctr / maxCtr) * 100)}%` }} />
            </div>
          </div>
          <div className="w-20 flex-shrink-0 text-right">
            <p className="text-sm font-extrabold text-slate-800 tabular-nums">{row.ctr.toFixed(2)}%</p>
            <p className="text-[11px] text-slate-500 font-medium tabular-nums">CTR</p>
          </div>
          <div className="w-24 flex-shrink-0 text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-700 tabular-nums">{formatCurrency(row.cpc, currency)}</p>
            <p className="text-[11px] text-slate-500 font-medium">CPC</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function MetaAdsAnalysis({ range, currency }: { range: string; currency: string }) {
  const [dimension, setDimension] = useState<MetaAdsBreakdownDimension>("age")
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/meta-ads/insights?range=${range}&dimension=${dimension}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? "Gagal mengambil data")
        return body as InsightsResponse
      })
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal mengambil data")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range, dimension])

  const sortedBreakdown = useMemo(() => data?.breakdown ?? [], [data])

  if (error) {
    return (
      <Alert variant="error" title="Gagal memuat Analisa Performa">
        {error}
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <Card variant="feature" padding="none">
        <div className="p-4 sm:p-5 border-b border-slate-200/60 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-extrabold text-slate-800">Tren Spend Harian</h2>
        </div>
        <div className="p-4 sm:p-5">
          {loading && !data ? (
            <div className="flex items-center justify-center py-10">
              <Spinner />
            </div>
          ) : data && data.trend.length > 0 ? (
            <TrendChart points={data.trend} currency={currency} />
          ) : (
            <p className="text-sm text-slate-500 font-medium text-center py-6">Belum ada data di rentang ini.</p>
          )}
        </div>
      </Card>

      <Card variant="feature" padding="none">
        <div className="p-4 sm:p-5 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">Target Market — Performa per Segmen</h2>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Diurutkan dari CTR tertinggi — segmen ini yang paling responsif.</p>
            </div>
          </div>
          <div className="w-full sm:w-48">
            <Select options={DIMENSION_OPTIONS} value={dimension} onChange={(v) => setDimension(v as MetaAdsBreakdownDimension)} searchable={false} />
          </div>
        </div>
        {loading && !data ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <BreakdownTable rows={sortedBreakdown} currency={currency} />
        )}
      </Card>
    </div>
  )
}
