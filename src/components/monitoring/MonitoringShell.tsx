"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeftRight, GitFork, Globe, LayoutGrid, Server } from "lucide-react"

import { ModuleLogoutButton } from "@/components/modules/ModuleLogoutButton"

interface NavLeaf {
  label: string
  href: string
  icon: React.ReactNode
  ownerAdminOnly?: boolean
}

const NAV: NavLeaf[] = [
  { label: "Monitoring Server", href: "/monitoring", icon: <LayoutGrid className="w-5 h-5" /> },
  { label: "Domain", href: "/monitoring/domain", icon: <Globe className="w-5 h-5" />, ownerAdminOnly: true },
  { label: "Server", href: "/monitoring/server", icon: <Server className="w-5 h-5" />, ownerAdminOnly: true },
  { label: "Git Apps", href: "/monitoring/git-apps", icon: <GitFork className="w-5 h-5" />, ownerAdminOnly: true },
]

function isActivePath(pathname: string, href: string) {
  if (href === "/monitoring") return pathname === "/monitoring"
  return pathname === href || pathname.startsWith(href + "/")
}

export const MonitoringShell: React.FC<{ userName: string; userRole: string; children: React.ReactNode }> = ({
  userName,
  userRole,
  children,
}) => {
  const pathname = usePathname() || "/monitoring"
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = userName.trim().charAt(0).toUpperCase() || "?"
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin" || userRole === "sysadmin"
  const nav = NAV.filter((item) => !item.ownerAdminOnly || isOwnerOrAdmin)
  const activeLabel = nav.find((item) => isActivePath(pathname, item.href))?.label ?? "Monitoring Server"

  return (
    <div className="min-h-screen bg-app-mesh text-slate-800 font-sans flex relative overflow-x-clip">
      {/* ---- Sidebar (desktop) ---- */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col justify-between bg-gradient-to-b from-[#0a2540] via-[#09356b] to-[#041c38] text-white shadow-2xl border-r border-blue-900/40">
        <div>
          <div className="h-20 px-5 flex flex-col justify-center border-b border-blue-800/40">
            <span className="font-black text-xl tracking-wide leading-none">SEVEN OS</span>
            <span className="text-[10px] text-blue-200 font-semibold tracking-tight mt-0.5">Monitoring Server</span>
          </div>
          <nav className="px-3 py-6 space-y-1.5">
            {nav.map((item) => {
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
            href="/modules"
            className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4 flex-shrink-0" /> Ganti Modul
          </Link>
          <div className="px-1">
            <ModuleLogoutButton />
          </div>
        </div>
      </aside>

      {/* ---- Konten ---- */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <header className="h-16 glass-header sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between border-b border-white/60">
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-extrabold text-slate-800 leading-tight">{activeLabel}</span>
            <span className="text-[11px] text-slate-500 font-semibold truncate">Halo, {userName}</span>
          </div>

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
                </div>
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <span className="text-slate-500">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
                <Link
                  href="/modules"
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <ArrowLeftRight className="w-4 h-4 text-slate-500" /> Ganti Modul
                </Link>
                <div className="px-2 py-1.5 border-t border-slate-200/60 mt-1">
                  <ModuleLogoutButton />
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 relative z-10 max-w-6xl w-full mx-auto">{children}</main>
      </div>

      {/* ---- Bottom nav (mobile) ---- */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-1">
        <div className="glass-header flex items-center justify-around rounded-2xl border border-white/70 shadow-xl px-1.5 py-2">
          {nav.map((item) => {
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
