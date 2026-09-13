"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"

import { Alert, Badge, Button, Card, Input, Select, SkeletonList } from "@/components/ui"
import { useListScrollRestore } from "@/lib/use-list-scroll-restore"
import { FilterPills, MktHeader, OutcomeBadge, PriorityPinBadge, ScopeToggle, useMarketingStream, useVisibilityRefresh } from "./ui"
import { WhatsappStatusBanner } from "./WhatsappStatusBanner"

interface ConversationItem {
  id: string
  leadId: string
  lead: {
    displayName: string
    companyName: string | null
    whatsappNumber: string
    temperature: string
    priorityLevel: string
    outcome: string
    lostReasonName: string | null
    priorityPinnedAt: string | null
    priorityPinNote: string | null
    segmentName: string | null
  }
  pic: { id: string; name: string } | null
  whatsappConnectionLabel: string | null
  lastMessageAt: string | null
  lastMessagePreview: { body: string | null; direction: string } | null
  /** Cuma terisi saat ada kata kunci pencarian: pesan di dalam chat yang cocok. */
  matchedMessage: { body: string | null; direction: string; sentAt: string } | null
  unreadCustomerCount: number
  canAct: boolean
}

const PAGE_SIZE = 50

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "unread", label: "Belum Dibalas" },
  { key: "priority", label: "Prioritas" },
  { key: "pinned", label: "⭐ Ditandai SPV" },
  { key: "hot", label: "Hot" },
]

/** Potong isi pesan di sekitar kata yang dicari, lalu tandai bagian yang cocok — kalau pesannya
 *  panjang, yang penting bagian yang bikin baris ini muncul tetap kelihatan, bukan kepotong di
 *  awal kalimat. */
function highlightSnippet(body: string, term: string) {
  const idx = body.toLowerCase().indexOf(term.toLowerCase())
  if (idx < 0) return <>{body.length > 120 ? `${body.slice(0, 120)}…` : body}</>
  const start = Math.max(0, idx - 40)
  const end = Math.min(body.length, idx + term.length + 60)
  return (
    <>
      {start > 0 && "…"}
      {body.slice(start, idx)}
      <mark className="bg-amber-200 text-slate-900 rounded px-0.5">{body.slice(idx, idx + term.length)}</mark>
      {body.slice(idx + term.length, end)}
      {end < body.length && "…"}
    </>
  )
}

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

interface WhatsappNumberOption {
  id: string
  label: string
  ownerName: string | null
}

export const InboxClient: React.FC<{ isSales?: boolean }> = ({ isSales = false }) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [filter, setFilter] = useState(searchParams.get("filter") ?? "all")
  // Sales terkunci ke "mine" (lihat halaman inbox/page.tsx) — backend juga sudah maksa ini
  // (GET /api/marketing/conversations mengabaikan query scope kalau rolenya SALES), toggle-nya
  // sengaja disembunyikan di bawah biar tidak ada UI yang keliatan bisa diklik tapi percuma.
  const [scope, setScope] = useState<"all" | "mine">(isSales ? "mine" : searchParams.get("scope") === "mine" ? "mine" : "all")
  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const [waConnectionId, setWaConnectionId] = useState(searchParams.get("waConnectionId") ?? "")
  const [waNumbers, setWaNumbers] = useState<WhatsappNumberOption[]>([])
  const [items, setItems] = useState<ConversationItem[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const qDebounced = useRef(q)
  // Halaman ke berapa yang sedang tampil — dipakai refresh diam-diam (SSE/polling) supaya tidak
  // mengecilkan daftar balik ke 50 baris pertama saat user sudah menekan "Muat lebih banyak".
  const pageRef = useRef(1)

  useEffect(() => {
    fetch("/api/marketing/conversations/whatsapp-numbers", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setWaNumbers(data.numbers ?? []))
      .catch(() => {})
  }, [])

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const params = new URLSearchParams({ filter, scope, limit: String(PAGE_SIZE) })
        if (qDebounced.current.trim()) params.set("q", qDebounced.current.trim())
        if (waConnectionId) params.set("waConnectionId", waConnectionId)

        if (!silent) {
          // Simpan filter ke URL (replace, bukan push) supaya kalau user buka Detail Inbox lalu
          // pencet tombol Back, filter yang tadi dipilih masih kepakai — bukan reset ke default.
          // Refresh diam-diam (polling/SSE) sengaja tidak ikut nulis URL biar tidak berisik.
          const urlParams = new URLSearchParams()
          if (filter !== "all") urlParams.set("filter", filter)
          if (!isSales && scope !== "all") urlParams.set("scope", scope)
          if (qDebounced.current.trim()) urlParams.set("q", qDebounced.current.trim())
          if (waConnectionId) urlParams.set("waConnectionId", waConnectionId)
          const qs = urlParams.toString()
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
        }

        const res = await fetch(`/api/marketing/conversations?${params}`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Gagal memuat")
          return
        }
        setError(null)
        setTotal(data.total)
        if (silent) {
          // Refresh diam-diam cuma menyegarkan halaman pertama (di situ semua chat yang baru
          // masuk muncul, karena urutannya pesan terbaru di atas). Baris dari halaman berikutnya
          // yang sudah dimuat user dipertahankan di bawahnya, jangan sampai hilang sendiri.
          setItems((prev) => {
            const freshIds = new Set((data.conversations as ConversationItem[]).map((c) => c.id))
            return [...data.conversations, ...prev.filter((c) => !freshIds.has(c.id))]
          })
        } else {
          pageRef.current = 1
          setItems(data.conversations)
          setHasMore(data.hasMore)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [filter, scope, waConnectionId, isSales, pathname, router],
  )

  /** "Muat lebih banyak" — ambil halaman berikutnya lalu sambung ke bawah (dedupe by id, karena
   *  percakapan bisa pindah halaman kalau ada chat baru masuk sambil daftar dibuka). */
  const loadMore = useCallback(async () => {
    const next = pageRef.current + 1
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ filter, scope, limit: String(PAGE_SIZE), page: String(next) })
      if (qDebounced.current.trim()) params.set("q", qDebounced.current.trim())
      if (waConnectionId) params.set("waConnectionId", waConnectionId)

      const res = await fetch(`/api/marketing/conversations?${params}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memuat")
        return
      }
      pageRef.current = next
      setTotal(data.total)
      setHasMore(data.hasMore)
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        return [...prev, ...(data.conversations as ConversationItem[]).filter((c) => !seen.has(c.id))]
      })
    } finally {
      setLoadingMore(false)
    }
  }, [filter, scope, waConnectionId])

  useEffect(() => {
    load()
  }, [load])

  // Kembalikan posisi scroll kalau user datang dari Back (mis. habis buka salah satu percakapan)
  // — baru dijalankan setelah barisnya ter-render, lihat catatan di useListScrollRestore.
  useListScrollRestore(!loading && items.length > 0)

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
      <MktHeader title={total > 0 ? `Inbox (${total})` : "Inbox"}>
        {!isSales && <ScopeToggle value={scope === "mine" ? "mine" : "all"} onChange={(v) => setScope(v)} order={["all", "mine"]} />}
      </MktHeader>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nama, perusahaan, nomor, atau isi chat…"
        leftIcon={<Search className="w-4 h-4" />}
        sizeVariant="md"
      />

      <FilterPills options={FILTERS} value={filter} onChange={setFilter} />

      {waNumbers.length > 1 && (
        <Select
          options={[
            { value: "", label: "Semua Nomor WA" },
            ...waNumbers.map((n) => ({ value: n.id, label: n.ownerName ? `${n.label} (${n.ownerName})` : n.label })),
          ]}
          value={waConnectionId}
          onChange={setWaConnectionId}
          sizeVariant="sm"
        />
      )}

      <WhatsappStatusBanner />

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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {c.lead.displayName}
                          {c.lead.companyName ? <span className="font-medium text-slate-400"> · {c.lead.companyName}</span> : null}
                        </p>
                        {/* status lead (Won/Lost/dst) langsung kelihatan di daftar — sebelumnya
                            baru ketahuan setelah percakapannya dibuka. */}
                        <OutcomeBadge outcome={c.lead.outcome} lostReason={c.lead.lostReasonName} />
                        <PriorityPinBadge pinnedAt={c.lead.priorityPinnedAt} note={c.lead.priorityPinNote} compact />
                      </div>
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
                    {/* Saat mencari, preview "pesan terakhir" di atas sering bukan pesan yang bikin
                        baris ini muncul — jadi pesan yang cocok ditampilkan terpisah di bawahnya. */}
                    {c.matchedMessage?.body && qDebounced.current.trim() && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                        <span className="font-bold text-amber-700">
                          {c.matchedMessage.direction === "OUTBOUND" ? "Kamu" : "Customer"}
                          {" · "}
                          {relativeTime(c.matchedMessage.sentAt)}
                        </span>{" "}
                        {highlightSnippet(c.matchedMessage.body, qDebounced.current.trim())}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {c.whatsappConnectionLabel && (
                        <Badge variant="secondary" size="sm">{c.whatsappConnectionLabel}</Badge>
                      )}
                      {c.lead.segmentName && <Badge variant="secondary" size="sm">{c.lead.segmentName}</Badge>}
                      {(c.lead.priorityLevel === "HIGH" || c.lead.priorityLevel === "TOP") && (
                        <Badge variant="warning" size="sm">Prioritas</Badge>
                      )}
                      {c.pic && <Badge variant="secondary" size="sm">Sales: {c.pic.name}</Badge>}
                      {c.lead.priorityPinnedAt && c.lead.priorityPinNote && (
                        <span className="text-[10px] font-bold text-amber-700 truncate">⭐ {c.lead.priorityPinNote}</span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && hasMore && (
        <Button variant="secondary" fullWidth isLoading={loadingMore} onClick={loadMore}>
          Muat lebih banyak ({items.length}/{total})
        </Button>
      )}
    </div>
  )
}
