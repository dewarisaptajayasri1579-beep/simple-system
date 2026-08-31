"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarClock, Flame, MessagesSquare, TriangleAlert } from "lucide-react"

import { Alert, Badge, Card, SkeletonList, StatTile } from "@/components/ui"
import { MktHeader, ScopeToggle, tempBadgeVariant } from "./ui"

interface WorkItem {
  id: string
  displayName: string
  companyName: string | null
  temperature: string
  stage: string
  segmentName: string | null
  priorityScore: number
  priorityLevel: string
  reason: string
  nextAction: string
  nextFollowUpAt: string | null
  conversationId: string | null
  unread: number
  canAct: boolean
}

interface HomeData {
  scope: "mine" | "all"
  kpi: { hotLeads: number; followUpToday: number; followUpOverdue: number; unrepliedChats: number }
  workOn: WorkItem[]
}

export const HomeClient: React.FC<{ isSales?: boolean }> = ({ isSales = false }) => {
  const router = useRouter()
  const [scope, setScope] = useState<"mine" | "all">("mine")
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const res = await fetch(`/api/marketing/home?scope=${scope}`, { cache: "no-store" })
        const d = await res.json()
        if (!res.ok) {
          setError(d.error || "Gagal memuat")
          return
        }
        setError(null)
        setData(d)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [scope],
  )

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const t = setInterval(() => load(true), 20000)
    return () => clearInterval(t)
  }, [load])

  const kpi = data?.kpi
  const cards = [
    { label: "Lead Hot", value: kpi?.hotLeads ?? 0, icon: Flame, color: "rose" as const, href: "/marketing/leads?temperature=HOT" },
    { label: "Follow Up Hari Ini", value: kpi?.followUpToday ?? 0, icon: CalendarClock, color: "blue" as const, href: "/marketing/follow-up" },
    { label: "Terlambat", value: kpi?.followUpOverdue ?? 0, icon: TriangleAlert, color: "amber" as const, href: "/marketing/follow-up" },
    { label: "Chat Belum Dibalas", value: kpi?.unrepliedChats ?? 0, icon: MessagesSquare, color: "indigo" as const, href: "/marketing/inbox" },
  ]

  return (
    <div className="flex flex-col gap-5">
      <MktHeader title="Beranda">
        {!isSales && <ScopeToggle value={scope} onChange={setScope} />}
      </MktHeader>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <StatTile label={c.label} value={c.value} icon={c.icon} color={c.color} className="hover:-translate-y-0.5 transition-transform" />
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Kerjakan Dulu</h2>
        {loading ? (
          <SkeletonList rows={4} />
        ) : !data || data.workOn.length === 0 ? (
          <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
            Tidak ada lead prioritas. 🎉
          </Card>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.workOn.map((w) => {
              // Klik kartu di mana pun langsung buka chat (kalau lead ini sudah punya percakapan)
              // — dulu harus klik teks "Buka Chat" secara spesifik. Nama lead tetap bisa diklik
              // sendiri ke Detail Lead (stopPropagation biar tidak ikut trigger buka chat).
              const goToChat = w.conversationId ? () => router.push(`/marketing/inbox/${w.conversationId}`) : undefined
              return (
                <li key={w.id}>
                  <Card
                    variant="solid"
                    padding="sm"
                    hoverable
                    onClick={goToChat}
                    className={`!rounded-2xl ${goToChat ? "cursor-pointer" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/marketing/leads/${w.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-bold text-slate-800 hover:text-blue-700 truncate"
                      >
                        {w.displayName}
                        {w.companyName ? <span className="font-medium text-slate-400"> · {w.companyName}</span> : null}
                      </Link>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge variant={tempBadgeVariant(w.temperature)} size="sm">{w.temperature}</Badge>
                        <Badge variant="info" size="sm">Skor {Math.round(w.priorityScore)}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{w.reason}</p>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <p className="text-xs font-bold text-slate-700">→ {w.nextAction}</p>
                      {w.conversationId && (
                        <span className="text-[11px] font-bold text-blue-700 flex-shrink-0">
                          Buka Chat{w.unread > 0 ? ` (${w.unread})` : ""}
                        </span>
                      )}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
