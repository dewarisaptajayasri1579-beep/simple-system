"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CalendarClock, Flame, MessagesSquare, TriangleAlert } from "lucide-react"

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

const TEMP_BADGE: Record<string, string> = {
  HOT: "bg-rose-100 text-rose-700",
  WARM: "bg-amber-100 text-amber-700",
  COLD: "bg-slate-100 text-slate-600",
}

export const HomeClient: React.FC = () => {
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
    { key: "hot", label: "Lead Hot", value: kpi?.hotLeads ?? 0, icon: <Flame className="w-4 h-4" />, tone: "text-rose-600 bg-rose-50", href: "/marketing/leads?temperature=HOT" },
    { key: "today", label: "Follow Up Hari Ini", value: kpi?.followUpToday ?? 0, icon: <CalendarClock className="w-4 h-4" />, tone: "text-blue-600 bg-blue-50", href: "/marketing/follow-up" },
    { key: "overdue", label: "Terlambat", value: kpi?.followUpOverdue ?? 0, icon: <TriangleAlert className="w-4 h-4" />, tone: "text-amber-600 bg-amber-50", href: "/marketing/follow-up" },
    { key: "unreplied", label: "Chat Belum Dibalas", value: kpi?.unrepliedChats ?? 0, icon: <MessagesSquare className="w-4 h-4" />, tone: "text-indigo-600 bg-indigo-50", href: "/marketing/inbox" },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-900">Beranda</h1>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold">
          {(["mine", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${scope === s ? "bg-blue-700 text-white" : "text-slate-500 hover:text-slate-800"}`}
            >
              {s === "mine" ? "Punya Saya" : "Semua Tim"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map((c) => (
          <Link key={c.key} href={c.href} className="rounded-2xl border border-slate-200 bg-white p-3.5 hover:border-blue-300 transition-colors">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.tone}`}>{c.icon}</div>
            <p className="text-2xl font-black text-slate-900 mt-2">{c.value}</p>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">{c.label}</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500 mb-2">Kerjakan Dulu</h2>
        {loading ? (
          <p className="text-sm text-slate-500 font-medium py-8 text-center">Memuat…</p>
        ) : !data || data.workOn.length === 0 ? (
          <p className="text-sm text-slate-500 font-medium py-8 text-center">Tidak ada lead prioritas. 🎉</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.workOn.map((w) => (
              <li key={w.id} className="p-3 rounded-2xl bg-white border border-slate-200/80">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/marketing/leads/${w.id}`} className="text-sm font-bold text-slate-800 hover:text-blue-700 truncate">
                    {w.displayName}
                    {w.companyName ? <span className="font-medium text-slate-400"> · {w.companyName}</span> : null}
                  </Link>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TEMP_BADGE[w.temperature]}`}>{w.temperature}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Skor {Math.round(w.priorityScore)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1">{w.reason}</p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <p className="text-xs font-bold text-slate-700">→ {w.nextAction}</p>
                  {w.conversationId && (
                    <Link
                      href={`/marketing/inbox/${w.conversationId}`}
                      className="text-[11px] font-bold text-blue-700 flex-shrink-0"
                    >
                      Buka Chat{w.unread > 0 ? ` (${w.unread})` : ""}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
