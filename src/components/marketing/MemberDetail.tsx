"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
}

interface LeadRow {
  id: string
  displayName: string
  companyName: string | null
  temperature: string
  priorityScore: number
  currentActivityStage: string
  outcome: string
}

const TEMP_BADGE: Record<string, string> = {
  HOT: "bg-rose-100 text-rose-700",
  WARM: "bg-amber-100 text-amber-700",
  COLD: "bg-slate-100 text-slate-600",
}

export const MemberDetail: React.FC<{ userId: string }> = ({ userId }) => {
  const [member, setMember] = useState<Member | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/marketing/team", { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/marketing/leads?picUserId=${userId}&limit=100&sort=priority`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([team, leadRes]) => {
        if (team.error) return setError(team.error)
        setMember(team.members.find((m: Member) => m.userId === userId) ?? null)
        setLeads(leadRes.leads ?? [])
      })
      .catch(() => setError("Gagal memuat"))
  }, [userId])

  if (error) return <p className="text-sm font-semibold text-rose-600 py-10 text-center">{error}</p>
  if (!member) return <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>

  const rate =
    member.followUpCompletedThisMonth > 0
      ? Math.round((member.followUpOnTimeThisMonth / member.followUpCompletedThisMonth) * 100)
      : null
  const cards = [
    { label: "Lead Aktif", value: member.activeLeads },
    { label: "Hot", value: member.hotLeads },
    { label: "FU Hari Ini", value: member.followUpToday },
    { label: "FU Telat", value: member.followUpOverdue },
    { label: "Chat Blm Dibalas", value: member.unrepliedChats },
    { label: "Won (bln ini)", value: member.wonThisMonth },
    { label: "On-Time FU", value: rate == null ? "—" : `${rate}%` },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Link href="/marketing/tim" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Tim
      </Link>
      <h1 className="text-xl font-black text-slate-900">{member.name}</h1>

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xl font-black text-slate-900">{c.value}</p>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Lead ({leads.length})</h2>
        <ul className="flex flex-col gap-1.5">
          {leads.map((l) => (
            <li key={l.id}>
              <Link
                href={`/marketing/leads/${l.id}`}
                className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-300"
              >
                <span className="text-sm font-bold text-slate-800 truncate">
                  {l.displayName}
                  {l.companyName ? <span className="font-medium text-slate-400"> · {l.companyName}</span> : null}
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TEMP_BADGE[l.temperature]}`}>{l.temperature}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{Math.round(l.priorityScore)}</span>
                  {l.outcome !== "OPEN" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{l.outcome}</span>}
                </span>
              </Link>
            </li>
          ))}
          {leads.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Belum ada lead.</p>}
        </ul>
      </div>
    </div>
  )
}
