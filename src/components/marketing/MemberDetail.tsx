"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, Badge, Card, SkeletonList, StatTile } from "@/components/ui"
import { tempBadgeVariant } from "./ui"

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

  if (error) return <Alert variant="error">{error}</Alert>
  if (!member) return <SkeletonList rows={5} />

  const rate =
    member.followUpCompletedThisMonth > 0
      ? Math.round((member.followUpOnTimeThisMonth / member.followUpCompletedThisMonth) * 100)
      : null
  const cards: { label: string; value: string | number; color?: React.ComponentProps<typeof StatTile>["color"] }[] = [
    { label: "Lead Aktif", value: member.activeLeads, color: "blue" },
    { label: "Hot", value: member.hotLeads, color: "rose" },
    { label: "FU Hari Ini", value: member.followUpToday, color: "blue" },
    { label: "FU Telat", value: member.followUpOverdue, color: "amber" },
    { label: "Chat Blm Dibalas", value: member.unrepliedChats, color: "indigo" },
    { label: "Won (bln ini)", value: member.wonThisMonth, color: "emerald" },
    { label: "On-Time FU", value: rate == null ? "—" : `${rate}%`, color: "emerald" },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Link href="/marketing/tim" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Tim
      </Link>
      <h1 className="text-xl font-black text-slate-900">{member.name}</h1>

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <StatTile key={c.label} label={c.label} value={c.value} color={c.color} />
        ))}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Lead ({leads.length})</h2>
        <ul className="flex flex-col gap-1.5">
          {leads.map((l) => (
            <li key={l.id}>
              <Link href={`/marketing/leads/${l.id}`}>
                <Card variant="solid" padding="sm" hoverable className="!rounded-2xl flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800 truncate">
                    {l.displayName}
                    {l.companyName ? <span className="font-medium text-slate-400"> · {l.companyName}</span> : null}
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant={tempBadgeVariant(l.temperature)} size="sm">{l.temperature}</Badge>
                    <Badge variant="info" size="sm">{Math.round(l.priorityScore)}</Badge>
                    {l.outcome !== "OPEN" && <Badge variant="secondary" size="sm">{l.outcome}</Badge>}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
          {leads.length === 0 && (
            <Card variant="feature" padding="lg" className="text-center text-sm text-slate-400">
              Belum ada lead.
            </Card>
          )}
        </ul>
      </div>
    </div>
  )
}
