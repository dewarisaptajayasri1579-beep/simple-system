"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, Badge, Card, SkeletonList, StatTile, Tab, TabList, Tabs } from "@/components/ui"
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

interface FollowUp {
  id: string
  leadId: string
  lead: { displayName: string } | null
  scheduledAt: string
  purpose: string
  status: string
  resultType: { name: string } | null
  isOnTime: boolean | null
}

interface Activity {
  id: string
  occurredAt: string
  note: string | null
  typeName: string
  lead: { id: string; displayName: string } | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export const MemberDetail: React.FC<{ userId: string }> = ({ userId }) => {
  const [member, setMember] = useState<Member | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState("ringkasan")

  useEffect(() => {
    Promise.all([
      fetch("/api/marketing/team", { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/marketing/leads?picUserId=${userId}&limit=100&sort=priority`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/marketing/follow-ups?assignedUserId=${userId}&bucket=all&limit=60`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/marketing/activities?actorUserId=${userId}&limit=50`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([team, leadRes, fuRes, actRes]) => {
        if (team.error) return setError(team.error)
        setMember(team.members.find((m: Member) => m.userId === userId) ?? null)
        setLeads(leadRes.leads ?? [])
        setFollowUps(fuRes.followUps ?? [])
        setActivities(actRes.activities ?? [])
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

      <Tabs value={tab} onChange={setTab}>
        <TabList>
          <Tab value="ringkasan">Ringkasan</Tab>
          <Tab value="leads">Leads ({leads.length})</Tab>
          <Tab value="followup">Follow Up ({followUps.length})</Tab>
          <Tab value="aktivitas">Aktivitas ({activities.length})</Tab>
        </TabList>
      </Tabs>

      {tab === "ringkasan" && (
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5">
          {cards.map((c) => (
            <StatTile key={c.label} label={c.label} value={c.value} color={c.color} />
          ))}
        </div>
      )}

      {tab === "leads" && (
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
          {leads.length === 0 && <Card variant="feature" padding="lg" className="text-center text-sm text-slate-400">Belum ada lead.</Card>}
        </ul>
      )}

      {tab === "followup" && (
        <ul className="flex flex-col gap-1.5">
          {followUps.map((f) => (
            <li key={f.id}>
              <Card variant="solid" padding="sm" className="!rounded-2xl">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/marketing/leads/${f.leadId}`} className="text-sm font-bold text-slate-800 hover:text-blue-700 truncate">
                    {f.lead?.displayName ?? "Lead"}
                  </Link>
                  <span className="text-[11px] text-slate-400 font-semibold flex-shrink-0">{fmt(f.scheduledAt)}</span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{f.purpose}</p>
                <div className="text-[11px] font-semibold mt-1">
                  <Badge variant={f.status === "OPEN" ? "info" : f.status === "COMPLETED" ? "success" : "secondary"} size="sm">
                    {f.status}
                  </Badge>
                  {f.status === "COMPLETED" && (
                    <span className={`ml-1.5 ${f.isOnTime ? "text-emerald-600" : "text-amber-600"}`}>
                      {f.isOnTime ? "tepat waktu" : "telat"} · {f.resultType?.name ?? "-"}
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
          {followUps.length === 0 && <Card variant="feature" padding="lg" className="text-center text-sm text-slate-400">Belum ada follow up.</Card>}
        </ul>
      )}

      {tab === "aktivitas" && (
        <ul className="flex flex-col gap-1.5">
          {activities.map((a) => (
            <li key={a.id}>
              <Card variant="solid" padding="sm" className="!rounded-2xl">
                <p className="text-sm">
                  <span className="font-bold text-slate-700">{a.typeName}</span>
                  {a.lead && (
                    <>
                      {" · "}
                      <Link href={`/marketing/leads/${a.lead.id}`} className="text-blue-700 hover:underline">
                        {a.lead.displayName}
                      </Link>
                    </>
                  )}
                  <span className="text-slate-400"> · {fmt(a.occurredAt)}</span>
                </p>
                {a.note && <p className="text-xs text-slate-500 mt-0.5">{a.note}</p>}
              </Card>
            </li>
          ))}
          {activities.length === 0 && <Card variant="feature" padding="lg" className="text-center text-sm text-slate-400">Belum ada aktivitas.</Card>}
        </ul>
      )}
    </div>
  )
}
