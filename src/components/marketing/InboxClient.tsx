"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

interface ConversationItem {
  id: string
  leadId: string
  lead: {
    displayName: string
    companyName: string | null
    whatsappNumber: string
    temperature: string
    priorityLevel: string
    segmentName: string | null
  }
  pic: { id: string; name: string } | null
  lastMessageAt: string | null
  lastMessagePreview: { body: string | null; direction: string } | null
  unreadCustomerCount: number
  canAct: boolean
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "unread", label: "Belum Dibalas" },
  { key: "priority", label: "Prioritas" },
  { key: "hot", label: "Hot" },
]

const TEMP_DOT: Record<string, string> = { HOT: "bg-rose-500", WARM: "bg-amber-500", COLD: "bg-slate-400" }

function relativeTime(iso: string | null) {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "baru saja"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}h`
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

export const InboxClient: React.FC = () => {
  const [filter, setFilter] = useState("all")
  const [scope, setScope] = useState<"all" | "mine">("all")
  const [q, setQ] = useState("")
  const [items, setItems] = useState<ConversationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const qDebounced = useRef(q)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams({ filter, scope, limit: "50" })
      if (qDebounced.current.trim()) params.set("q", qDebounced.current.trim())
      const res = await fetch(`/api/marketing/conversations?${params}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memuat")
        return
      }
      setError(null)
      setItems(data.conversations)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filter, scope])

  useEffect(() => {
    load()
  }, [load])

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      qDebounced.current = q
      load()
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // polling realtime
  useEffect(() => {
    const t = setInterval(() => load(true), 15000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-900">Inbox</h1>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold">
          {(["all", "mine"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                scope === s ? "bg-blue-700 text-white" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {s === "all" ? "Semua Tim" : "Punya Saya"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, perusahaan, atau nomor…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              filter === f.key ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 font-medium py-10 text-center">Tidak ada percakapan.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/marketing/inbox/${c.id}`}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TEMP_DOT[c.lead.temperature] ?? "bg-slate-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {c.lead.displayName}
                      {c.lead.companyName ? <span className="font-medium text-slate-400"> · {c.lead.companyName}</span> : null}
                    </p>
                    <span className="text-[11px] text-slate-400 font-semibold flex-shrink-0">{relativeTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-slate-500 truncate">
                      {c.lastMessagePreview?.direction === "OUTBOUND" ? "Kamu: " : ""}
                      {c.lastMessagePreview?.body ?? "—"}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!c.canAct && <span className="text-[10px] font-bold text-slate-400">pantau</span>}
                      {c.unreadCustomerCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center">
                          {c.unreadCustomerCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {c.lead.segmentName && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{c.lead.segmentName}</span>
                    )}
                    {(c.lead.priorityLevel === "HIGH" || c.lead.priorityLevel === "TOP") && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Prioritas</span>
                    )}
                    {c.pic && <span className="text-[10px] font-semibold text-slate-400">PIC: {c.pic.name}</span>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
