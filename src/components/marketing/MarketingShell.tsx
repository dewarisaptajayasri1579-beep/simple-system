"use client"

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarClock,
  ChartNoAxesCombined,
  ChevronDown,
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

interface NavLeaf {
  type: "leaf"
  label: string
  href: string
  icon: React.ReactNode
}
interface NavGroup {
  type: "group"
  label: string
  icon: React.ReactNode
  children: NavLeaf[]
}
type NavNode = NavLeaf | NavGroup

const leaf = (label: string, href: string, icon: React.ReactNode): NavLeaf => ({ type: "leaf", label, href, icon })

// Digrupkan supaya sidebar tidak terus bertambah panjang tiap ada menu baru — grup accordion
// (klik nama grup, sub-menu buka/nutup di tempat), bukan pindah halaman. Bottom-nav mobile
// TIDAK ikut berubah struktur (lihat MOBILE_NAV di bawah), tetap flat seperti sebelumnya karena
// ruangnya terbatas buat accordion.
const NAV: NavNode[] = [
  leaf("Beranda", "/marketing", <LayoutGrid className="w-5 h-5" />),
  {
    type: "group",
    label: "Percakapan",
    icon: <MessagesSquare className="w-5 h-5" />,
    children: [leaf("Inbox", "/marketing/inbox", <MessagesSquare className="w-5 h-5" />), leaf("Grup", "/marketing/groups", <UsersRound className="w-5 h-5" />)],
  },
  {
    type: "group",
    label: "Lead",
    icon: <Users className="w-5 h-5" />,
    children: [
      leaf("Semua Lead", "/marketing/leads", <Users className="w-5 h-5" />),
      leaf("Follow Up", "/marketing/follow-up", <CalendarClock className="w-5 h-5" />),
      leaf("Closing", "/marketing/closing", <Trophy className="w-5 h-5" />),
      leaf("Client Lama", "/marketing/client-lama", <History className="w-5 h-5" />),
    ],
  },
  {
    type: "group",
    label: "Tim & Analitik",
    icon: <Network className="w-5 h-5" />,
    children: [leaf("Tim", "/marketing/tim", <Network className="w-5 h-5" />), leaf("Analitik", "/marketing/analitik", <ChartNoAxesCombined className="w-5 h-5" />)],
  },
  leaf("Pengaturan", "/marketing/settings", <Settings className="w-5 h-5" />),
]

// Set fix, terpisah dari NAV desktop — bottom-nav mobile ruangnya terbatas, tidak ikut accordion.
const MOBILE_NAV: NavLeaf[] = [
  leaf("Beranda", "/marketing", <LayoutGrid className="w-5 h-5" />),
  leaf("Inbox", "/marketing/inbox", <MessagesSquare className="w-5 h-5" />),
  leaf("Grup", "/marketing/groups", <UsersRound className="w-5 h-5" />),
  leaf("Lead", "/marketing/leads", <Users className="w-5 h-5" />),
  leaf("Follow Up", "/marketing/follow-up", <CalendarClock className="w-5 h-5" />),
  leaf("Tim", "/marketing/tim", <Network className="w-5 h-5" />),
]

function isActivePath(pathname: string, href: string) {
  if (href === "/marketing") return pathname === "/marketing"
  return pathname === href || pathname.startsWith(href + "/")
}

function containsActiveChild(pathname: string, group: NavGroup) {
  return group.children.some((c) => isActivePath(pathname, c.href))
}

/** 1 baris nav desktop — leaf jadi Link biasa, group jadi tombol accordion (expand/collapse di
 *  tempat) yang otomatis kebuka kalau salah satu anaknya lagi aktif. Pola sama seperti
 *  SidebarNavItem di os-template (referensi komponen internal). */
const MarketingNavItem: React.FC<{ item: NavNode; pathname: string }> = ({ item, pathname }) => {
  const activeChild = item.type === "group" && containsActiveChild(pathname, item)
  const [isOpen, setIsOpen] = useState(activeChild)

  if (item.type === "group") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 cursor-pointer ${
            activeChild ? "text-white bg-white/10" : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          <span className="flex-shrink-0">{item.icon}</span>
          <span className="truncate flex-1 text-left">{item.label}</span>
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && (
          <div className="mt-1 ml-4 pl-4 border-l border-white/10 space-y-1">
            {item.children.map((child) => {
              const active = isActivePath(pathname, child.href)
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    active ? "bg-gradient-to-r from-[#0544cc] to-[#2563eb] text-white shadow-lg shadow-blue-600/30" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="flex-shrink-0">{child.icon}</span>
                  <span className="truncate">{child.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const active = isActivePath(pathname, item.href)
  return (
    <Link
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
            {NAV.map((item) => (
              <MarketingNavItem key={item.type === "group" ? item.label : item.href} item={item} pathname={pathname} />
            ))}
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
                    href="/marketing/analitik"
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <ChartNoAxesCombined className="w-4 h-4 text-slate-500" /> Analitik
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
          {MOBILE_NAV.map((item) => {
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
