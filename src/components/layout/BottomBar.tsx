"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Wallet, Landmark, ShoppingCart, MoreHorizontal, X } from "lucide-react";
import { navItemsForRole } from "./Sidebar";

export interface BottomNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export const bottomNavItems: BottomNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutGrid className="w-5 h-5" /> },
  { label: "Invoice", href: "/penjualan", icon: <ShoppingCart className="w-5 h-5" /> },
  { label: "Bayar", href: "/pembayaran", icon: <Wallet className="w-5 h-5" /> },
  { label: "Keuangan", href: "/keuangan", icon: <Landmark className="w-5 h-5" /> },
];

export const BottomBar: React.FC<{ userRole?: string }> = ({ userRole }) => {
  const pathname = usePathname() || "/dashboard";
  const [showMore, setShowMore] = useState(false);

  // Sama restriksi dengan Sidebar (lihat navItemsForRole) — admin diarahkan ke Kas Keluar
  // langsung, bukan hub Keuangan yang juga ada Kas Masuk.
  const mainItems = userRole === "admin" ? bottomNavItems.map((item) => (item.label === "Keuangan" ? { ...item, href: "/keuangan/kas-keluar" } : item)) : bottomNavItems;

  // Sisa menu (termasuk Laporan) masuk slot "Lainnya", sumbernya dari daftar menu Sidebar
  // per role supaya Owner tetap bisa akses semua modul (Proyek, Akuntansi, Pengaturan, dst) di mobile.
  const mainHrefs = new Set(bottomNavItems.map((item) => item.href));
  const moreItems = navItemsForRole(userRole).filter((item) => !mainHrefs.has(item.href));

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(href + "/") || (pathname === "/" && href === "/dashboard");
  const isMoreActive = moreItems.some((item) => isItemActive(item.href));

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-1">
        <div className="glass-header flex items-center justify-around rounded-2xl border border-white/70 shadow-xl px-2 py-2">
          {mainItems.map((item) => {
            const isActive = isItemActive(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-1 px-3 py-1.5 min-w-[64px]">
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    isActive ? "bg-gradient-to-r from-[#0544cc] to-[#2563eb] text-white shadow-lg shadow-blue-600/30" : "text-slate-500"
                  }`}
                >
                  {item.icon}
                </span>
                <span className={`text-[11px] font-bold ${isActive ? "text-blue-700" : "text-slate-500"}`}>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="flex flex-col items-center gap-1 px-3 py-1.5 min-w-[64px]"
          >
            <span
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isMoreActive ? "bg-gradient-to-r from-[#0544cc] to-[#2563eb] text-white shadow-lg shadow-blue-600/30" : "text-slate-500"
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </span>
            <span className={`text-[11px] font-bold ${isMoreActive ? "text-blue-700" : "text-slate-500"}`}>Lainnya</span>
          </button>
        </div>
      </nav>

      {showMore && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMore(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu Lainnya"
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl px-4 pt-3 pb-6 max-h-[70vh] overflow-y-auto animate-slide-up"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-slate-700">Menu Lainnya</h3>
              <button
                type="button"
                onClick={() => setShowMore(false)}
                aria-label="Tutup"
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {moreItems.map((item) => {
                const isActive = isItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-2xl text-center"
                  >
                    <span
                      className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${
                        isActive ? "bg-gradient-to-r from-[#0544cc] to-[#2563eb] text-white shadow-lg shadow-blue-600/30" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className={`text-[11px] font-bold leading-tight ${isActive ? "text-blue-700" : "text-slate-600"}`}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
