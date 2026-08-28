"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { CompleteFollowUpForm } from "./CompleteFollowUpForm"

interface Opt {
  id: string
  name: string
}

interface FollowUp {
  id: string
  leadId: string
  lead: { id: string; displayName: string; companyName: string | null; temperature: string } | null
  scheduledAt: string
  purpose: string
  note: string | null
  status: string
  resultType: { code: string; name: string } | null
  completedAt: string | null
  isOnTime: boolean | null
  assignedUser: Opt | null
  bucket: string
}

const TABS: { key: string; label: string }[] = [
  { key: "overdue", label: "Terlambat" },
  { key: "today", label: "Hari Ini" },
  { key: "upcoming", label: "Akan Datang" },
  { key: "done", label: "Selesai" },
]

const TEMP_DOT: Record<string, string> = { HOT: "bg-rose-500", WARM: "bg-amber-500", COLD: "bg-slate-400" }

function fmt(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export const FollowUpBoard: React.FC = () => {
  const [bucket, setBucket] = useState("today")
  const [scope, setScope] = useState<"all" | "mine">("mine")
  const [items, setItems] = useState<FollowUp[]>([])
  const [counts, setCounts] = useState<{ today: number; upcoming: number; overdue: number }>({ today: 0, upcoming: 0, overdue: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resultTypes, setResultTypes] = useState<Opt[]>([])
  const [completing, setCompleting] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => d.followUpResultTypes && setResultTypes(d.followUpResultTypes))
      .catch(() => {})
  }, [])

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const res = await fetch(`/api/marketing/follow-ups?scope=${scope}&bucket=${bucket}&limit=80`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Gagal memuat")
          return
        }
        setError(null)
        setItems(data.followUps)
        setCounts(data.counts)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [scope, bucket],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(() => load(true), 30000)
    return () => clearInterval(t)
  }, [load])

  const cancel = async (id: string) => {
    const res = await fetch(`/api/marketing/follow-ups/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (res.ok) load()
    else {
      const d = await res.json()
      setError(d.error || "Gagal membatalkan")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-900">Follow Up</h1>
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

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const badge = t.key === "today" ? counts.today : t.key === "upcoming" ? counts.upcoming : t.key === "overdue" ? counts.overdue : null
          return (
            <button
              key={t.key}
              onClick={() => setBucket(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                bucket === t.key ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
              {badge != null && badge > 0 ? ` (${badge})` : ""}
            </button>
          )
        })}
      </div>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 font-medium py-10 text-center">Tidak ada follow up di kategori ini.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((f) => (
            <li key={f.id} className="p-3 rounded-2xl bg-white border border-slate-200/80">
              <div className="flex items-start gap-2.5">
                <span className={`w-2.5 h-2.5 mt-1 rounded-full flex-shrink-0 ${TEMP_DOT[f.lead?.temperature ?? ""] ?? "bg-slate-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/marketing/leads/${f.leadId}`} className="text-sm font-bold text-slate-800 hover:text-blue-700 truncate">
                      {f.lead?.displayName ?? "Lead"}
                    </Link>
                    <span className="text-[11px] text-slate-400 font-semibold flex-shrink-0">{fmt(f.scheduledAt)}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{f.purpose}</p>
                  {f.note && <p className="text-xs text-slate-400 mt-0.5">{f.note}</p>}
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-semibold">
                    <span>{f.assignedUser?.name ?? "—"}</span>
                    {f.status === "COMPLETED" && (
                      <span className={f.isOnTime ? "text-emerald-600" : "text-amber-600"}>
                        {f.isOnTime ? "tepat waktu" : "telat"} · {f.resultType?.name ?? "-"}
                      </span>
                    )}
                    {f.status === "CANCELLED" && <span className="text-slate-400">dibatalkan</span>}
                  </div>

                  {f.status === "OPEN" && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setCompleting(completing === f.id ? null : f.id)}
                        className="px-2.5 py-1 rounded-lg bg-blue-700 text-white text-[11px] font-bold"
                      >
                        Selesaikan
                      </button>
                      <button
                        onClick={() => cancel(f.id)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 text-[11px] font-bold"
                      >
                        Batalkan
                      </button>
                    </div>
                  )}
                  {completing === f.id && (
                    <CompleteFollowUpForm
                      followUpId={f.id}
                      resultTypes={resultTypes}
                      onDone={() => {
                        setCompleting(null)
                        load()
                      }}
                      onCancel={() => setCompleting(null)}
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
