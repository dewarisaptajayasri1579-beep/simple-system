"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import {
  Alert,
  Card,
  Input,
  Select,
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
    avgResponseMinutes: number | null
  }
  conversion: { leadToHot: number | null; proposalRate: number | null; negotiationRate: number | null; winRate: number | null }
  funnel: { stage: string; label: string; count: number }[]
  segmentPerformance: {
    segmentId: string | null
    name: string
    leads: number
    hot: number
    won: number
    lost: number
    winRate: number | null
  }[]
  team: {
    userId: string
    name: string
    activeLeads: number
    hotLeads: number
    followUpOverdue: number
    wonThisMonth: number
  }[]
}

export const ManagerDashboard: React.FC = () => {
  const [data, setData] = useState<DashData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [segmentId, setSegmentId] = useState("")
  const [segments, setSegments] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => d.segments && setSegments(d.segments))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    const p = new URLSearchParams()
    if (from) p.set("from", new Date(from).toISOString())
    if (to) p.set("to", new Date(to + "T23:59:59").toISOString())
    if (segmentId) p.set("segmentId", segmentId)
    try {
      const res = await fetch(`/api/marketing/dashboard?${p}`, { cache: "no-store" })
      const d = await res.json()
      if (d.error) setError(d.error)
      else {
        setData(d)
        setError(null)
      }
    } catch {
      setError("Gagal memuat")
    }
  }, [from, to, segmentId])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <Alert variant="error">{error}</Alert>
  if (!data) return <SkeletonList rows={6} />

  const { kpi, conversion } = data
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
    { label: "Avg Respons", value: kpi.avgResponseMinutes == null ? "—" : `${kpi.avgResponseMinutes}m`, color: "indigo" },
  ]
  const convCards = [
    { label: "Lead → Hot", value: conversion.leadToHot },
    { label: "Proposal Rate", value: conversion.proposalRate },
    { label: "Negotiation Rate", value: conversion.negotiationRate },
    { label: "Win Rate", value: conversion.winRate },
  ]
  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count))

  return (
    <div className="flex flex-col gap-6">
      <MktHeader title="Dashboard" />

      <Card variant="feature" padding="md" className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Input type="date" label="Dari" value={from} onChange={(e) => setFrom(e.target.value)} sizeVariant="sm" />
        </div>
        <div className="w-40">
          <Input type="date" label="Sampai" value={to} onChange={(e) => setTo(e.target.value)} sizeVariant="sm" />
        </div>
        <div className="w-44">
          <label className="text-xs sm:text-sm font-bold text-slate-700">Segmen</label>
          <div className="mt-1.5">
            <Select
              options={[{ value: "", label: "Semua Segmen" }, ...segments.map((s) => ({ value: s.id, label: s.name }))]}
              value={segmentId}
              onChange={setSegmentId}
              sizeVariant="sm"
            />
          </div>
        </div>
        {(from || to || segmentId) && (
          <button
            onClick={() => {
              setFrom("")
              setTo("")
              setSegmentId("")
            }}
            className="text-xs font-bold text-blue-700 pb-2"
          >
            Reset
          </button>
        )}
      </Card>

      <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5">
        {kpiCards.map((c) => (
          <StatTile key={c.label} label={c.label} value={c.value} color={c.color} />
        ))}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Conversion</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {convCards.map((c) => (
            <StatTile key={c.label} label={c.label} value={c.value == null ? "—" : `${c.value}%`} color="blue" />
          ))}
        </div>
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
                <TableHead className="text-right">Hot</TableHead>
                <TableHead className="text-right">Won</TableHead>
                <TableHead className="text-right">Lost</TableHead>
                <TableHead className="text-right">Win Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.segmentPerformance.map((s) => (
                <TableRow key={s.segmentId ?? "none"}>
                  <TableCell className="font-bold text-slate-800">{s.name}</TableCell>
                  <TableCell className="text-right">{s.leads}</TableCell>
                  <TableCell className="text-right text-rose-600 font-bold">{s.hot || ""}</TableCell>
                  <TableCell className="text-right text-emerald-600 font-bold">{s.won || ""}</TableCell>
                  <TableCell className="text-right text-slate-500">{s.lost || ""}</TableCell>
                  <TableCell className="text-right">{s.winRate == null ? "—" : `${s.winRate}%`}</TableCell>
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
