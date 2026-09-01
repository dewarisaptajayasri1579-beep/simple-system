"use client"

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart2,
  CalendarClock,
  FileBarChart,
  Gauge,
  History,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Network,
  QrCode,
  Settings,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react"

import { NotificationBell } from "./NotificationBell"
import { PushRegister } from "./PushRegister"

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  /** tampil juga di bottom-nav mobile */
  mobile?: boolean
}

const NAV: NavItem[] = [
  { label: "Beranda", href: "/marketing", icon: <LayoutGrid className="w-5 h-5" />, mobile: true },
  { label: "Inbox", href: "/marketing/inbox", icon: <MessagesSquare className="w-5 h-5" />, mobile: true },
  { label: "Grup", href: "/marketing/groups", icon: <UsersRound className="w-5 h-5" />, mobile: true },
  { label: "Lead", href: "/marketing/leads", icon: <Users className="w-5 h-5" />, mobile: true },
  { label: "Follow Up", href: "/marketing/follow-up", icon: <CalendarClock className="w-5 h-5" />, mobile: true },
  { label: "Closing", href: "/marketing/closing", icon: <Trophy className="w-5 h-5" /> },
  { label: "Client Lama", href: "/marketing/client-lama", icon: <History className="w-5 h-5" /> },
  { label: "Tim", href: "/marketing/tim", icon: <Network className="w-5 h-5" />, mobile: true },
  { label: "KPI", href: "/marketing/kpi", icon: <Gauge className="w-5 h-5" /> },
  { label: "Dashboard", href: "/marketing/dashboard", icon: <BarChart2 className="w-5 h-5" /> },
  { label: "Laporan", href: "/marketing/laporan", icon: <FileBarChart className="w-5 h-5" /> },
  { label: "Pengaturan", href: "/marketing/settings", icon: <Settings className="w-5 h-5" /> },
]

function isActivePath(pathname: string, href: string) {
  if (href === "/marketing") return pathname === "/marketing"
  return pathname === href || pathname.startsWith(href + "/")
}

async function doLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store" })
  } finally {
    document.cookie = "session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
    window.location.replace("/login")
  }
}

export const MarketingShell: React.FC<{ userName: string; roleLabel: string; children: React.ReactNode }> = ({
  userName,
  roleLabel,
  children,
}) => {
  const pathname = usePathname() || "/marketing"
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = userName.trim().charAt(0).toUpperCase() || "?"
  // Halaman detail percakapan (/marketing/inbox/<id> atau /marketing/groups/<id>) — mode fokus:
  // bottom-nav disembunyikan, header dikasih tombol kembali.
  const isConversationDetail = /^\/marketing\/inbox\/[^/]+$/.test(pathname)
  const isGroupDetail = /^\/marketing\/groups\/[^/]+$/.test(pathname)
  const isChatDetail = isConversationDetail || isGroupDetail

  // Status koneksi WhatsApp Sales yang login — null = belum tahu, true = minimal 1 nomor READY.
  const [waReady, setWaReady] = useState<boolean | null>(null)
  const checkWa = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/whatsapp/connections", { cache: "no-store" })
      if (res.status === 502) return // WAHUB tak merespons — pertahankan status terakhir
      if (!res.ok) {
        setWaReady(false)
        return
      }
      const d = await res.json()
      setWaReady(Array.isArray(d.connections) && d.connections.some((c: { status: string }) => c.status === "READY"))
    } catch {
      /* jaringan bermasalah — pertahankan status terakhir */
    }
  }, [])
  useEffect(() => {
    checkWa()
    const t = setInterval(checkWa, 60000)
    const onVis = () => document.visibilityState === "visible" && checkWa()
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("focus", onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("focus", onVis)
    }
  }, [checkWa])

  const waLabel = waReady ? "WhatsApp Terhubung" : "Hubungkan WhatsApp"
  const waBadge = (light: boolean) =>
    waReady === null ? null : (
      <span
        className={`ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full ${
          waReady
            ? light
              ? "bg-emerald-100 text-emerald-700"
              : "bg-emerald-500/20 text-emerald-300"
            : light
              ? "bg-rose-100 text-rose-700"
              : "bg-rose-500/20 text-rose-300"
        }`}
      >
        {waReady ? "Terhubung" : "Putus"}
      </span>
    )

  return (
    <div className="min-h-screen bg-app-mesh text-slate-800 font-sans flex relative overflow-x-clip">
      <PushRegister />
      {/* ---- Sidebar (desktop) ---- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col justify-between bg-gradient-to-b from-[#0a2540] via-[#09356b] to-[#041c38] text-white shadow-2xl border-r border-blue-900/40">
        <div>
          <div className="h-20 px-5 flex flex-col justify-center border-b border-blue-800/40">
            <span className="font-black text-xl tracking-wide leading-none">SEVEN OS</span>
            <span className="text-[10px] text-blue-200 font-semibold tracking-tight mt-0.5">Marketing — Kelola Lead</span>
          </div>
          <nav className="px-3 py-6 space-y-1.5">
            {NAV.map((item) => {
              const active = isActivePath(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 ${
                    active
                      ? "bg-gradient-to-r from-[#0544cc] to-[#2563eb] text-white shadow-lg shadow-blue-600/30 border border-blue-400/40 translate-x-1"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-blue-800/40 bg-black/15 space-y-1">
          <Link
            href="/marketing/whatsapp"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <QrCode className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{waLabel}</span>
            {waBadge(false)}
          </Link>
          <Link
            href="/modules"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4 flex-shrink-0" /> Ganti Modul
          </Link>
          <button
            onClick={doLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" /> Keluar
          </button>
        </div>
      </aside>

      {/* ---- Konten ---- */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <header className="h-16 glass-header sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between border-b border-white/60">
          <div className="flex items-center gap-2 min-w-0">
            {isChatDetail && (
              <Link
                href={isGroupDetail ? "/marketing/groups" : "/marketing/inbox"}
                aria-label={isGroupDetail ? "Kembali ke Grup" : "Kembali ke Inbox"}
                className="w-9 h-9 -ml-1.5 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-extrabold text-slate-800 leading-tight">
                {isGroupDetail ? "Grup" : isConversationDetail ? "Percakapan" : "Marketing"}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold truncate">
                Halo, {userName} · {roleLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <NotificationBell />

            <div className="relative lg:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="w-9 h-9 rounded-2xl bg-blue-700 text-white text-sm font-black flex items-center justify-center shadow-sm cursor-pointer"
                aria-label="Menu akun"
              >
                {initial}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 glass-dropdown p-2 rounded-2xl shadow-xl z-50">
                  <div className="px-3 py-2 border-b border-slate-200/60 mb-1">
                    <p className="text-xs font-bold text-slate-800">{userName}</p>
                    <p className="text-[11px] text-slate-500 font-medium">{roleLabel}</p>
                  </div>
                  <Link
                    href="/marketing/whatsapp"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <QrCode className="w-4 h-4 text-slate-500" />
                    <span className="truncate">{waLabel}</span>
                    {waBadge(true)}
                  </Link>
                  <Link
                    href="/marketing/kpi"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <Gauge className="w-4 h-4 text-slate-500" /> KPI
                  </Link>
                  <Link
                    href="/marketing/dashboard"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <BarChart2 className="w-4 h-4 text-slate-500" /> Dashboard
                  </Link>
                  <Link
                    href="/marketing/settings"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <Settings className="w-4 h-4 text-slate-500" /> Pengaturan
                  </Link>
                  <Link
                    href="/modules"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-slate-500" /> Ganti Modul
                  </Link>
                  <button
                    onClick={doLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" /> Keluar (Logout)
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className={`flex-1 p-4 sm:p-6 lg:p-8 ${isChatDetail ? "pb-4" : "pb-24"} lg:pb-8 relative z-10 max-w-6xl w-full mx-auto`}
        >
          {children}
        </main>
      </div>

      {/* ---- Bottom nav (mobile) — disembunyikan di halaman detail percakapan ---- */}
      <nav className={`${isChatDetail ? "hidden" : "lg:hidden"} fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-1`}>
        <div className="glass-header flex items-center justify-around rounded-2xl border border-white/70 shadow-xl px-1.5 py-2">
          {NAV.filter((n) => n.mobile).map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 px-2 py-1 min-w-[58px]">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    active ? "bg-gradient-to-r from-[#0544cc] to-[#2563eb] text-white shadow-lg shadow-blue-600/30" : "text-slate-500"
                  }`}
                >
                  {item.icon}
                </span>
                <span className={`text-[10px] font-bold ${active ? "text-blue-700" : "text-slate-500"}`}>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
