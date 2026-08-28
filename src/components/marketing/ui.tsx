"use client"

import React from "react"

import type { BadgeProps } from "@/components/ui"

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
    es.addEventListener("message", handler)
    es.addEventListener("notification", handler)
    return () => {
      es.removeEventListener("message", handler)
      es.removeEventListener("notification", handler)
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

/** Header halaman: judul + aksi kanan. */
export const MktHeader: React.FC<{ title: React.ReactNode; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <h1 className="text-xl font-black text-slate-900">{title}</h1>
    {children ? <div className="flex items-center gap-2">{children}</div> : null}
  </div>
)
