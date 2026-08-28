"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

interface DashData {
  kpi: {
    totalLeads: number
    cold: number
    warm: number
    hot: number
    open: number
    won: number
    lost: number
    followUpOverdue: number
    followUpOnTimeRate: number | null
  }
  funnel: { stage: string; label: string; count: number }[]
  segmentPerformance: { segmentId: string | null; name: string; leads: number; won: number }[]
  team: {
    userId: string
    name: string
    activeLeads: number
    hotLeads: number
    followUpOverdue: number
    wonThisMonth: number
    followUpCompletedThisMonth: number
    followUpOnTimeThisMonth: number
  }[]
}

export const ManagerDashboard: React.FC = () => {
  const [data, setData] = useState<DashData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/marketing/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("Gagal memuat"))
  }, [])

  if (error) return <p className="text-sm font-semibold text-rose-600 py-10 text-center">{error}</p>
  if (!data) return <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>

  const { kpi } = data
  const kpiCards = [
    { label: "Total Lead", value: kpi.totalLeads },
    { label: "Cold", value: kpi.cold },
    { label: "Warm", value: kpi.warm },
    { label: "Hot", value: kpi.hot },
    { label: "Open", value: kpi.open },
    { label: "Won", value: kpi.won },
    { label: "Lost", value: kpi.lost },
    { label: "FU Telat", value: kpi.followUpOverdue },
    { label: "On-Time FU", value: kpi.followUpOnTimeRate == null ? "—" : `${kpi.followUpOnTimeRate}%` },
  ]
  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-black text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5">
        {kpiCards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xl font-black text-slate-900">{c.value}</p>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Funnel Tahap (lead OPEN)</h2>
        <div className="flex flex-col gap-1.5">
          {data.funnel.map((f) => (
            <div key={f.stage} className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 w-24 flex-shrink-0">{f.label}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#0544cc] to-[#2563eb] rounded-full"
                  style={{ width: `${(f.count / funnelMax) * 100}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-700 w-8 text-right">{f.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Performa Segmen</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 font-bold">
              <tr>
                <th className="text-left px-3 py-2.5">Segmen</th>
                <th className="text-right px-3 py-2.5">Lead</th>
                <th className="text-right px-3 py-2.5">Won</th>
                <th className="text-right px-3 py-2.5">Konversi</th>
              </tr>
            </thead>
            <tbody>
              {data.segmentPerformance.map((s) => (
                <tr key={s.segmentId ?? "none"} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-bold text-slate-800">{s.name}</td>
                  <td className="px-3 py-2.5 text-right">{s.leads}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600 font-bold">{s.won || ""}</td>
                  <td className="px-3 py-2.5 text-right">{s.leads > 0 ? `${Math.round((s.won / s.leads) * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Performa Tim</h2>
          <Link href="/marketing/tim" className="text-xs font-bold text-blue-700">Detail Tim</Link>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 font-bold">
              <tr>
                <th className="text-left px-3 py-2.5">Sales</th>
                <th className="text-right px-3 py-2.5">Lead Aktif</th>
                <th className="text-right px-3 py-2.5">Hot</th>
                <th className="text-right px-3 py-2.5">FU Telat</th>
                <th className="text-right px-3 py-2.5">Won (bln)</th>
              </tr>
            </thead>
            <tbody>
              {data.team.map((m) => (
                <tr key={m.userId} className="border-t border-slate-100">
                  <td className="px-3 py-2.5">
                    <Link href={`/marketing/tim/${m.userId}`} className="font-bold text-slate-800 hover:text-blue-700">{m.name}</Link>
                  </td>
                  <td className="px-3 py-2.5 text-right">{m.activeLeads}</td>
                  <td className="px-3 py-2.5 text-right text-rose-600 font-bold">{m.hotLeads || ""}</td>
                  <td className="px-3 py-2.5 text-right text-amber-600 font-bold">{m.followUpOverdue || ""}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-600 font-bold">{m.wonThisMonth || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
