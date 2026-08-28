"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import {
  Alert,
  Card,
  SkeletonList,
  StatTile,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { MktHeader } from "./ui"

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

  if (error) return <Alert variant="error">{error}</Alert>
  if (!data) return <SkeletonList rows={6} />

  const { kpi } = data
  const kpiCards: { label: string; value: string | number; color?: React.ComponentProps<typeof StatTile>["color"] }[] = [
    { label: "Total Lead", value: kpi.totalLeads, color: "blue" },
    { label: "Cold", value: kpi.cold, color: "slate" },
    { label: "Warm", value: kpi.warm, color: "amber" },
    { label: "Hot", value: kpi.hot, color: "rose" },
    { label: "Open", value: kpi.open, color: "blue" },
    { label: "Won", value: kpi.won, color: "emerald" },
    { label: "Lost", value: kpi.lost, color: "slate" },
    { label: "FU Telat", value: kpi.followUpOverdue, color: "amber" },
    { label: "On-Time FU", value: kpi.followUpOnTimeRate == null ? "—" : `${kpi.followUpOnTimeRate}%`, color: "emerald" },
  ]
  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count))

  return (
    <div className="flex flex-col gap-6">
      <MktHeader title="Dashboard" />

      <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5">
        {kpiCards.map((c) => (
          <StatTile key={c.label} label={c.label} value={c.value} color={c.color} />
        ))}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Funnel Tahap (lead OPEN)</h2>
        <Card variant="feature" padding="md" className="flex flex-col gap-1.5">
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
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Performa Segmen</h2>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segmen</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Konversi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.segmentPerformance.map((s) => (
                <TableRow key={s.segmentId ?? "none"}>
                  <TableCell className="font-bold text-slate-800">{s.name}</TableCell>
                  <TableCell className="text-right">{s.leads}</TableCell>
                  <TableCell className="text-right text-emerald-600 font-bold">{s.won || ""}</TableCell>
                  <TableCell className="text-right">{s.leads > 0 ? `${Math.round((s.won / s.leads) * 100)}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">Performa Tim</h2>
          <Link href="/marketing/tim" className="text-xs font-bold text-blue-700">Detail Tim</Link>
        </div>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sales</TableHead>
                <TableHead className="text-right">Lead Aktif</TableHead>
                <TableHead className="text-right">Hot</TableHead>
                <TableHead className="text-right">FU Telat</TableHead>
                <TableHead className="text-right">Won (bln)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.team.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell>
                    <Link href={`/marketing/tim/${m.userId}`} className="font-bold text-slate-800 hover:text-blue-700">{m.name}</Link>
                  </TableCell>
                  <TableCell className="text-right">{m.activeLeads}</TableCell>
                  <TableCell className="text-right text-rose-600 font-bold">{m.hotLeads || ""}</TableCell>
                  <TableCell className="text-right text-amber-600 font-bold">{m.followUpOverdue || ""}</TableCell>
                  <TableCell className="text-right text-emerald-600 font-bold">{m.wonThisMonth || ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  )
}
