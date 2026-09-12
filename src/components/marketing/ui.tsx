"use client"

import React from "react"
import { Star } from "lucide-react"

import { Badge, type BadgeProps } from "@/components/ui"

/** Panggil `fn` setiap tab kembali fokus / online — biar polling terasa instan saat user
 *  balik ke halaman, tanpa perlu SSE. */
export function useVisibilityRefresh(fn: () => void) {
  const ref = React.useRef(fn)
  ref.current = fn
  React.useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") ref.current()
    }
    document.addEventListener("visibilitychange", run)
    window.addEventListener("focus", run)
    window.addEventListener("online", run)
    return () => {
      document.removeEventListener("visibilitychange", run)
      window.removeEventListener("focus", run)
      window.removeEventListener("online", run)
    }
  }, [])
}

export type MarketingStreamEvent =
  | { type: "message"; conversationId: string; leadId: string; direction: "INBOUND" | "OUTBOUND"; at: string }
  | { type: "notification"; userId: string; at: string }
  | { type: "status"; conversationId: string; providerMessageId: string; status: string; at: string }
  | { type: "typing"; conversationId: string; at: string }
  | { type: "group_message"; groupChatId: string; connectionUserId: string; direction: "INBOUND" | "OUTBOUND"; at: string }

/** Buka koneksi SSE ke `/api/marketing/stream` dan panggil `onEvent` tiap ada event realtime
 *  (pesan masuk/keluar, notifikasi baru). `EventSource` auto-reconnect sendiri kalau putus.
 *  Polling lambat di tiap komponen tetap dipertahankan sebagai jaring pengaman. */
export function useMarketingStream(onEvent: (evt: MarketingStreamEvent) => void) {
  const ref = React.useRef(onEvent)
  ref.current = onEvent
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return
    const es = new EventSource("/api/marketing/stream")
    const handler = (e: MessageEvent) => {
      try {
        ref.current(JSON.parse(e.data) as MarketingStreamEvent)
      } catch {
        /* frame bukan JSON (ready/ping) — abaikan */
      }
    }
    const names = ["message", "notification", "status", "typing", "group_message"]
    names.forEach((n) => es.addEventListener(n, handler))
    return () => {
      names.forEach((n) => es.removeEventListener(n, handler))
      es.close()
    }
  }, [])
}

/** Toggle "Punya Saya / Semua Tim" — dipakai di Beranda, Inbox, Lead, Follow Up. */
export const ScopeToggle: React.FC<{
  value: "mine" | "all"
  onChange: (v: "mine" | "all") => void
  /** urutan tampil; default mine dulu */
  order?: ("mine" | "all")[]
}> = ({ value, onChange, order = ["mine", "all"] }) => (
  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold">
    {order.map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => onChange(s)}
        className={`px-3 py-1.5 rounded-lg transition-colors ${
          value === s ? "bg-blue-700 text-white" : "text-slate-500 hover:text-slate-800"
        }`}
      >
        {s === "mine" ? "Punya Saya" : "Semua Tim"}
      </button>
    ))}
  </div>
)

/** Baris pill filter (Semua / Belum Dibalas / …). */
export const FilterPills: React.FC<{
  options: { key: string; label: string; badge?: number }[]
  value: string
  onChange: (key: string) => void
}> = ({ options, value, onChange }) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1">
    {options.map((o) => (
      <button
        key={o.key}
        type="button"
        onClick={() => onChange(o.key)}
        className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
          value === o.key
            ? "bg-blue-700 text-white"
            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        }`}
      >
        {o.label}
        {o.badge != null && o.badge > 0 ? ` (${o.badge})` : ""}
      </button>
    ))}
  </div>
)

export function tempBadgeVariant(t: string): BadgeProps["variant"] {
  if (t === "HOT") return "danger"
  if (t === "WARM") return "warning"
  return "secondary"
}

export const STAGE_LABEL: Record<string, string> = {
  NONE: "—",
  DISCUSSION: "Diskusi",
  ZOOM_DEMO: "Zoom/Demo",
  PROPOSAL: "Penawaran",
  NEGOTIATION: "Negosiasi",
}

export const OUTCOME_LABEL: Record<string, string> = {
  OPEN: "Open",
  WON: "Won",
  LOST: "Lost",
  CLOSING: "Closing",
  CLIENT_LAMA: "Client Lama",
}

export function outcomeBadgeVariant(o: string): BadgeProps["variant"] {
  if (o === "WON") return "success"
  if (o === "LOST") return "danger"
  if (o === "CLOSING") return "info"
  if (o === "CLIENT_LAMA") return "outline"
  return "secondary"
}

/** Status akhir lead (Won/Lost/Closing/Client Lama) — dipakai di daftar Lead, Inbox, dan header
 *  percakapan supaya penandanya seragam & kelihatan di depan, bukan kekunci di kolom paling kanan.
 *  Sengaja render `null` saat OPEN: mayoritas lead statusnya OPEN, kalau ikut dibadge malah jadi
 *  noise dan yang Lost/Won justru tenggelam. `lostReason` ikut ditempel biar tahu alasannya
 *  tanpa harus buka detail. */
export const OutcomeBadge: React.FC<{ outcome: string; lostReason?: string | null; size?: BadgeProps["size"] }> = ({
  outcome,
  lostReason,
  size = "sm",
}) => {
  if (!outcome || outcome === "OPEN") return null
  const label = OUTCOME_LABEL[outcome] ?? outcome
  return (
    <Badge variant={outcomeBadgeVariant(outcome)} size={size} className="flex-shrink-0">
      {outcome === "LOST" && lostReason ? `${label} · ${lostReason}` : label}
    </Badge>
  )
}

/** Penanda "Prioritas SPV" — lead yang ditandai SPV/Manager lewat tombol Tandai Prioritas.
 *  Sengaja dibedakan tajam dari badge lain (kuning + ikon bintang) karena tujuannya memang untuk
 *  menarik mata duluan di daftar yang isinya ratusan baris. Alasan dari SPV ikut ditempel supaya
 *  Sales tahu kenapa didahulukan tanpa harus buka detail. */
export const PriorityPinBadge: React.FC<{ pinnedAt: string | null; note?: string | null; compact?: boolean }> = ({
  pinnedAt,
  note,
  compact,
}) => {
  if (!pinnedAt) return null
  return (
    <span
      title={note ? `Prioritas SPV — ${note}` : "Ditandai prioritas oleh SPV/Manager"}
      className="inline-flex items-center gap-1 flex-shrink-0 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800"
    >
      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
      Prioritas
      {!compact && note ? <span className="font-bold normal-case tracking-normal">· {note}</span> : null}
    </span>
  )
}

/** Header halaman: judul + aksi kanan. */
export const MktHeader: React.FC<{ title: React.ReactNode; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <h1 className="text-xl font-black text-slate-900">{title}</h1>
    {children ? <div className="flex items-center gap-2">{children}</div> : null}
  </div>
)
