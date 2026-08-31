"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { Alert, Badge, Card, SkeletonList } from "@/components/ui"
import { MktHeader, useMarketingStream, useVisibilityRefresh } from "./ui"

interface GroupItem {
  id: string
  name: string
  whatsappConnectionLabel: string | null
  lastMessageAt: string | null
  lastMessagePreview: { body: string | null; direction: string; messageType: string } | null
  unreadCount: number
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

export const GroupsClient: React.FC = () => {
  const [items, setItems] = useState<GroupItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch("/api/marketing/groups", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memuat")
        return
      }
      setError(null)
      setItems(data.groups)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const t = setInterval(() => load(true), 20000)
    return () => clearInterval(t)
  }, [load])
  useVisibilityRefresh(() => load(true))
  useMarketingStream((evt) => {
    if (evt.type === "group_message") load(true)
  })

  return (
    <div className="flex flex-col gap-4">
      <MktHeader title="Grup WhatsApp" />

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <SkeletonList rows={6} />
      ) : items.length === 0 ? (
        <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
          Belum ada grup WhatsApp yang masuk.
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((g) => (
            <li key={g.id}>
              <Link href={`/marketing/groups/${g.id}`}>
                <Card variant="solid" padding="sm" hoverable className="!rounded-2xl flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800 truncate">{g.name}</p>
                      <span className="text-[11px] text-slate-400 font-semibold flex-shrink-0">{relativeTime(g.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-slate-500 truncate">
                        {g.lastMessagePreview?.direction === "OUTBOUND" ? "Kamu: " : ""}
                        {g.lastMessagePreview?.body ?? (g.lastMessagePreview ? `[${g.lastMessagePreview.messageType.toLowerCase()}]` : "—")}
                      </p>
                      {g.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                          {g.unreadCount}
                        </span>
                      )}
                    </div>
                    {g.whatsappConnectionLabel && (
                      <div className="mt-1">
                        <Badge variant="secondary" size="sm">{g.whatsappConnectionLabel}</Badge>
                      </div>
                    )}
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
