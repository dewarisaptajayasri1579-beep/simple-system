"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

import { Alert, Badge, Card, Input, SkeletonList } from "@/components/ui"
import { FilterPills, MktHeader, ScopeToggle, useMarketingStream, useVisibilityRefresh } from "./ui"

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

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "unread", label: "Belum Dibalas" },
  { key: "priority", label: "Prioritas" },
  { key: "hot", label: "Hot" },
]

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

  const load = useCallback(
    async (silent = false) => {
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
    },
    [filter, scope],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setTimeout(() => {
      qDebounced.current = q
      load()
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    // Fallback saja — jalur utama update-nya SSE di bawah.
    const t = setInterval(() => load(true), 20000)
    return () => clearInterval(t)
  }, [load])
  useVisibilityRefresh(() => load(true))
  useMarketingStream((evt) => {
    if (evt.type === "message") load(true)
  })

  return (
    <div className="flex flex-col gap-4">
      <MktHeader title="Inbox">
        <ScopeToggle value={scope === "mine" ? "mine" : "all"} onChange={(v) => setScope(v)} order={["all", "mine"]} />
      </MktHeader>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama, perusahaan, atau nomor…"
        leftIcon={<Search className="w-4 h-4" />}
        sizeVariant="md"
      />

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <SkeletonList rows={6} />
      ) : items.length === 0 ? (
        <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
          Tidak ada percakapan.
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/marketing/inbox/${c.id}`}>
                <Card variant="solid" padding="sm" hoverable className="!rounded-2xl flex items-center gap-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      c.lead.temperature === "HOT" ? "bg-rose-500" : c.lead.temperature === "WARM" ? "bg-amber-500" : "bg-slate-400"
                    }`}
                  />
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
                      {c.lead.segmentName && <Badge variant="secondary" size="sm">{c.lead.segmentName}</Badge>}
                      {(c.lead.priorityLevel === "HIGH" || c.lead.priorityLevel === "TOP") && (
                        <Badge variant="warning" size="sm">Prioritas</Badge>
                      )}
                      {c.pic && <span className="text-[10px] font-semibold text-slate-400">PIC: {c.pic.name}</span>}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
