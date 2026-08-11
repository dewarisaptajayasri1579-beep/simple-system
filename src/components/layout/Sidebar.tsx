"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLogo } from "../ui/AppLogo";
import {
  LayoutGrid,
  Wallet,
  ShoppingCart,
  Landmark,
  BarChart2,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Info,
  RefreshCcw,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutGrid className="w-5 h-5" /> },
  { label: "Dashboard Finance", href: "/dashboard-finance", icon: <RefreshCcw className="w-5 h-5" /> },
  { label: "Invoice", href: "/penjualan", icon: <ShoppingCart className="w-5 h-5" /> },
  { label: "Pembayaran", href: "/pembayaran", icon: <Wallet className="w-5 h-5" /> },
  { label: "Keuangan", href: "/keuangan", icon: <Landmark className="w-5 h-5" /> },
  { label: "Proyek", href: "/proyek", icon: <FolderKanban className="w-5 h-5" /> },
  { label: "Laporan", href: "/laporan", icon: <BarChart2 className="w-5 h-5" /> },
  { label: "Akuntansi", href: "/akuntansi", icon: <BookOpen className="w-5 h-5" /> },
  { label: "Pengaturan", href: "/pengaturan", icon: <Settings className="w-5 h-5" /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggleCollapse, className = "" }) => {
  const pathname = usePathname() || "/dashboard";

  return (
    <aside
      className={`hidden lg:flex fixed top-0 left-0 bottom-0 z-40 flex-col justify-between transition-all duration-300 select-none bg-gradient-to-b from-[#0a2540] via-[#09356b] to-[#041c38] text-white shadow-2xl border-r border-blue-900/40 ${
        isCollapsed ? "w-20" : "w-64"
      } ${className}`}
    >
      <div className="p-4 flex items-center justify-between border-b border-blue-800/40 h-20">
        {!isCollapsed ? (
          <div className="flex items-center gap-3 overflow-hidden">
            <AppLogo size="sm" iconOnly={true} />
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-wide text-white leading-none">SEVEN OS</span>
              <span className="text-[10px] text-blue-200 font-semibold tracking-tight mt-0.5">
                Sistem Internal
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto">
            <AppLogo size="sm" iconOnly={true} />
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || (pathname === "/" && item.href === "/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl font-bold text-sm transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-[#0544cc] to-[#2563eb] text-white shadow-lg shadow-blue-600/30 border border-blue-400/40 translate-x-1"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              } ${isCollapsed ? "justify-center px-0" : ""}`}
            >
              <span className={`flex-shrink-0 ${isActive ? "text-white" : "text-slate-300"}`}>{item.icon}</span>
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-blue-800/40 bg-black/15">
        {!isCollapsed ? (
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-xs text-blue-200/90 leading-relaxed mb-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Data Real-time</p>
                <p className="text-[11px] text-blue-200/70 mt-0.5">Piutang, domain & kas selalu terbaru.</p>
              </div>
            </div>
          </div>
        ) : null}

        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          aria-label={isCollapsed ? "Buka Sidebar" : "Tutup Sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold">
              <ChevronLeft className="w-4 h-4" />
              <span>Sembunyikan Menu</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
};
