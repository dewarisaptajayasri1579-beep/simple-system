"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Wallet, Landmark, ShoppingCart, BarChart2 } from "lucide-react";

export interface BottomNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

export const bottomNavItems: BottomNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutGrid className="w-5 h-5" /> },
  { label: "Bayar", href: "/pembayaran", icon: <Wallet className="w-5 h-5" /> },
  { label: "Penjualan", href: "/penjualan", icon: <ShoppingCart className="w-5 h-5" /> },
  { label: "Keuangan", href: "/keuangan", icon: <Landmark className="w-5 h-5" /> },
  { label: "Laporan", href: "/laporan", icon: <BarChart2 className="w-5 h-5" /> },
];

export const BottomBar: React.FC = () => {
  const pathname = usePathname() || "/dashboard";

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-1">
      <div className="glass-header flex items-center justify-around rounded-2xl border border-white/70 shadow-xl px-2 py-2">
        {bottomNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || (pathname === "/" && item.href === "/dashboard");
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
      </div>
    </nav>
  );
};
