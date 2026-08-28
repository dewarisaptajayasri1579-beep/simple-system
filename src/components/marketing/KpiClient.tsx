"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import {
  Alert,
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

interface Member {
  userId: string
  name: string
  activeLeads: number
  hotLeads: number
  followUpToday: number
  followUpOverdue: number
  unrepliedChats: number
  wonThisMonth: number
  followUpCompletedThisMonth: number
  followUpOnTimeThisMonth: number
  onTimeFollowUpRate: number | null
  avgResponseMinutes: number | null
  responseSamples: number
}

interface KpiData {
  scope: "me" | "team"
  canSeeTeam: boolean
  members: Member[]
  conversion: { leadToHot: number | null; proposalRate: number | null; negotiationRate: number | null; winRate: number | null }
  totals: { activeLeads: number; hotLeads: number; followUpOverdue: number; unrepliedChats: number; wonThisMonth: number }
}

function fmtMinutes(m: number | null) {
  if (m == null) return "—"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}j ${rem}m` : `${h}j`
}

export const KpiClient: React.FC = () => {
  const [scope, setScope] = useState<"me" | "team">("me")
  const [data, setData] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/kpi?scope=${scope}`, { cache: "no-store" })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Gagal memuat")
        return
      }
      setError(null)
      setData(d)
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !data) return <SkeletonList rows={6} />
  if (error) return <Alert variant="error">{error}</Alert>
  if (!data) return null

  const me = data.members[0]
  const conv = data.conversion
  const convCards = [
    { label: "Lead → Hot", value: conv.leadToHot },
    { label: "Proposal Rate", value: conv.proposalRate },
    { label: "Negotiation Rate", value: conv.negotiationRate },
    { label: "Win Rate", value: conv.winRate },
  ]

  return (
    <div className="flex flex-col gap-6">
      <MktHeader title="KPI">
        {data.canSeeTeam && (
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold">
            {(["me", "team"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${scope === s ? "bg-blue-700 text-white" : "text-slate-500 hover:text-slate-800"}`}
              >
                {s === "me" ? "KPI Saya" : "Tim"}
              </button>
            ))}
          </div>
        )}
      </MktHeader>

      {scope === "me" ? (
        <>
          {!me ? (
            <Alert variant="info">Belum ada data KPI. Kamu belum jadi PIC lead mana pun.</Alert>
          ) : (
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
              <StatTile label="Lead Aktif" value={me.activeLeads} color="blue" />
              <StatTile label="Lead Hot" value={me.hotLeads} color="rose" />
              <StatTile label="Follow Up Hari Ini" value={me.followUpToday} color="blue" />
              <StatTile label="Follow Up Terlambat" value={me.followUpOverdue} color="amber" />
              <StatTile label="Chat Belum Dibalas" value={me.unrepliedChats} color="indigo" />
              <StatTile label="Won (bulan ini)" value={me.wonThisMonth} color="emerald" />
              <StatTile
                label="On-Time Follow Up"
                value={me.onTimeFollowUpRate == null ? "—" : `${me.onTimeFollowUpRate}%`}
                color="emerald"
                hint={`${me.followUpOnTimeThisMonth}/${me.followUpCompletedThisMonth} bln ini`}
              />
              <StatTile
                label="Avg Waktu Balas"
                value={fmtMinutes(me.avgResponseMinutes)}
                color="purple"
                hint={me.responseSamples ? `${me.responseSamples} sampel (30h)` : "belum ada data"}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5">
            <StatTile label="Lead Aktif" value={data.totals.activeLeads} color="blue" />
            <StatTile label="Lead Hot" value={data.totals.hotLeads} color="rose" />
            <StatTile label="FU Terlambat" value={data.totals.followUpOverdue} color="amber" />
            <StatTile label="Chat Blm Dibalas" value={data.totals.unrepliedChats} color="indigo" />
            <StatTile label="Won (bln ini)" value={data.totals.wonThisMonth} color="emerald" />
          </div>

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Lead Aktif</TableHead>
                  <TableHead className="text-right">Hot</TableHead>
                  <TableHead className="text-right">FU Hari Ini</TableHead>
                  <TableHead className="text-right">FU Telat</TableHead>
                  <TableHead className="text-right">Chat Blm Dibalas</TableHead>
                  <TableHead className="text-right">Won (bln)</TableHead>
                  <TableHead className="text-right">On-Time FU</TableHead>
                  <TableHead className="text-right">Avg Balas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <Link href={`/marketing/tim/${m.userId}`} className="font-bold text-slate-800 hover:text-blue-700">
                        {m.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{m.activeLeads}</TableCell>
                    <TableCell className="text-right font-bold text-rose-600">{m.hotLeads || ""}</TableCell>
                    <TableCell className="text-right">{m.followUpToday || ""}</TableCell>
                    <TableCell className={`text-right font-bold ${m.followUpOverdue > 0 ? "text-amber-600" : "text-slate-400"}`}>
                      {m.followUpOverdue || ""}
                    </TableCell>
                    <TableCell className="text-right">{m.unrepliedChats || ""}</TableCell>
                    <TableCell className="text-right font-bold text-emerald-600">{m.wonThisMonth || ""}</TableCell>
                    <TableCell className="text-right">{m.onTimeFollowUpRate == null ? "—" : `${m.onTimeFollowUpRate}%`}</TableCell>
                    <TableCell className="text-right">{fmtMinutes(m.avgResponseMinutes)}</TableCell>
                  </TableRow>
                ))}
                {data.members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-slate-400 py-6">
                      Belum ada anggota tim.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Conversion</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {convCards.map((c) => (
            <StatTile key={c.label} label={c.label} value={c.value == null ? "—" : `${c.value}%`} color="blue" />
          ))}
        </div>
      </div>
    </div>
  )
}
