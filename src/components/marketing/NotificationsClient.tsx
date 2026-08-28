"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { Button, Card, SkeletonList } from "@/components/ui"
import { MktHeader } from "./ui"

interface Notif {
  id: string
  type: string
  title: string
  body: string
  deepLink: string | null
  read: boolean
  createdAt: string
}

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "baru saja"
  if (m < 60) return `${m}m lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}j lalu`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}h lalu`
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

export const NotificationsClient: React.FC = () => {
  const [items, setItems] = useState<Notif[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const res = await fetch(`/api/marketing/notifications?page=${p}&limit=40`, { cache: "no-store" })
      const d = await res.json()
      if (res.ok) {
        setItems((prev) => (append ? [...prev, ...d.notifications] : d.notifications))
        setHasMore(d.hasMore)
        setPage(d.page)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    load(1, false)
  }, [load])

  const markAll = async () => {
    await fetch("/api/marketing/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    load(1, false)
  }

  const markOne = (id: string) => {
    fetch("/api/marketing/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {})
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  return (
    <div className="flex flex-col gap-4">
      <MktHeader title="Notifikasi">
        <Button size="sm" variant="secondary" onClick={markAll}>
          Tandai semua dibaca
        </Button>
      </MktHeader>

      {loading ? (
        <SkeletonList rows={8} />
      ) : items.length === 0 ? (
        <Card variant="feature" padding="lg" className="text-center text-sm text-slate-500 font-medium">
          Belum ada notifikasi.
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {items.map((n) => {
              const inner = (
                <Card variant="solid" padding="sm" className={`!rounded-2xl ${n.read ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{n.title}</p>
                      <p className="text-xs text-slate-500">{n.body}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{ago(n.createdAt)}</p>
                    </div>
                  </div>
                </Card>
              )
              return n.deepLink ? (
                <li key={n.id}>
                  <Link href={n.deepLink} onClick={() => !n.read && markOne(n.id)}>
                    {inner}
                  </Link>
                </li>
              ) : (
                <li key={n.id} onClick={() => !n.read && markOne(n.id)}>
                  {inner}
                </li>
              )
            })}
          </ul>
          {hasMore && (
            <Button variant="secondary" fullWidth isLoading={loadingMore} onClick={() => load(page + 1, true)}>
              Muat lebih banyak
            </Button>
          )}
        </>
      )}
    </div>
  )
}
