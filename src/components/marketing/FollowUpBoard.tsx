"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { Alert, Button, Card, SkeletonList } from "@/components/ui"
import { CompleteFollowUpForm } from "./CompleteFollowUpForm"
import { FilterPills, MktHeader, ScopeToggle } from "./ui"

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

const TABS = [
  { key: "overdue", label: "Terlambat" },
  { key: "today", label: "Hari Ini" },
  { key: "upcoming", label: "Akan Datang" },
  { key: "done", label: "Selesai" },
]

function fmt(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export const FollowUpBoard: React.FC<{ isSales?: boolean }> = ({ isSales = false }) => {
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
    else setError((await res.json()).error || "Gagal membatalkan")
  }

  const tabsWithBadge = TABS.map((t) => ({
    ...t,
    badge: t.key === "today" ? counts.today : t.key === "upcoming" ? counts.upcoming : t.key === "overdue" ? counts.overdue : undefined,
  }))

  return (
    <div className="flex flex-col gap-4">
      <MktHeader title="Follow Up">
        {!isSales && <ScopeToggle value={scope === "mine" ? "mine" : "all"} onChange={(v) => setScope(v)} />}
      </MktHeader>

      <FilterPills options={tabsWithBadge} value={bucket} onChange={setBucket} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <SkeletonList rows={5} />
      ) : items.length === 0 ? (
        <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
          Tidak ada follow up di kategori ini.
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((f) => (
            <li key={f.id}>
              <Card variant="solid" padding="sm" className="!rounded-2xl">
                <div className="flex items-start gap-2.5">
                  <span
                    className={`w-2.5 h-2.5 mt-1 rounded-full flex-shrink-0 ${
                      f.lead?.temperature === "HOT" ? "bg-rose-500" : f.lead?.temperature === "WARM" ? "bg-amber-500" : "bg-slate-300"
                    }`}
                  />
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
                        <Button size="sm" onClick={() => setCompleting(completing === f.id ? null : f.id)}>
                          Selesaikan
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => cancel(f.id)}>
                          Batalkan
                        </Button>
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
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
