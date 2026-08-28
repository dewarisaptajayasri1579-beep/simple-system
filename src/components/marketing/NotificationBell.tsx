"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"

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
  return `${Math.floor(h / 24)}h lalu`
}

export const NotificationBell: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const boxRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/notifications", { cache: "no-store" })
      if (!res.ok) return
      const d = await res.json()
      setItems(d.notifications)
      setUnread(d.unreadCount)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const markAll = async () => {
    await fetch("/api/marketing/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    load()
  }

  const markOne = async (id: string) => {
    await fetch("/api/marketing/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    load()
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-2xl bg-white/70 border border-slate-200/80 text-slate-500 hover:bg-white transition-colors"
        aria-label="Notifikasi"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-black flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] glass-dropdown rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200/60">
            <p className="text-xs font-black text-slate-700">Notifikasi</p>
            <div className="flex items-center gap-2.5">
              {unread > 0 && (
                <button onClick={markAll} className="text-[11px] font-bold text-blue-700">
                  Tandai semua dibaca
                </button>
              )}
              <Link href="/marketing/notifications" onClick={() => setOpen(false)} className="text-[11px] font-bold text-slate-500">
                Lihat semua
              </Link>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Belum ada notifikasi.</p>
            ) : (
              items.map((n) => {
                const inner = (
                  <div
                    className={`px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 ${n.read ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{n.title}</p>
                        <p className="text-[11px] text-slate-500 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{ago(n.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                )
                return n.deepLink ? (
                  <Link key={n.id} href={n.deepLink} onClick={() => { setOpen(false); if (!n.read) markOne(n.id) }}>
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id} onClick={() => !n.read && markOne(n.id)}>
                    {inner}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
