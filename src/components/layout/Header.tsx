"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "../ui/Avatar";
import { Calendar, ChevronDown, Info, LogOut, Search } from "lucide-react";

export interface HeaderProps {
  userName: string;
  userRole?: string;
  className?: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  direktur: "Direktur",
  admin: "Admin",
};

export const Header: React.FC<HeaderProps> = ({ userName, userRole = "admin", className = "" }) => {
  const router = useRouter();
  const [currentDateTime, setCurrentDateTime] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
      ];
      const dayName = days[now.getDay()];
      const dateNum = now.getDate();
      const monthName = months[now.getMonth()];
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      setCurrentDateTime(`${dayName}, ${dateNum} ${monthName} ${year} | ${hours}:${minutes} WIB`);
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000 * 30);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
    } catch {
      // tetap lanjutkan ke halaman login meski request gagal
    } finally {
      if (typeof window !== "undefined") {
        document.cookie = "session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        window.location.replace("/login");
      } else {
        router.replace("/login");
        router.refresh();
      }
    }
  };

  return (
    <header className={`h-20 glass-header sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between transition-all duration-300 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="lg:hidden flex flex-col">
          <span className="font-extrabold text-base text-slate-800">SEVEN OS</span>
          <span className="text-[10px] text-slate-500 font-semibold">Sistem Internal</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/dokumentasi"
          className="flex items-center justify-center w-9 h-9 rounded-2xl bg-white/70 hover:bg-white backdrop-blur-md border border-slate-200/80 shadow-xs text-slate-500 transition-colors cursor-pointer"
          aria-label="Dokumentasi"
          title="Dokumentasi"
        >
          <Info className="w-4 h-4" />
        </Link>

        <button
          onClick={() => window.dispatchEvent(new Event("toggle-command-palette"))}
          className="flex items-center gap-2.5 px-3 sm:px-4 py-2 rounded-2xl bg-white/70 hover:bg-white backdrop-blur-md border border-slate-200/80 shadow-xs text-xs sm:text-sm font-semibold text-slate-500 transition-colors cursor-pointer"
          aria-label="Buka pencarian"
        >
          <Search className="w-4 h-4 text-slate-400" />
          <span className="hidden md:inline">Cari...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-400">
            ⌘K
          </kbd>
        </button>

        <div className="hidden lg:flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/70 backdrop-blur-md border border-slate-200/80 shadow-xs text-xs sm:text-sm font-bold text-slate-700">
          <Calendar className="w-4 h-4 text-blue-700" />
          <span>{currentDateTime}</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 px-3 py-1.5 rounded-2xl bg-white/80 hover:bg-white border border-slate-200/90 shadow-sm transition-all cursor-pointer"
          >
            <Avatar name={userName} size="sm" status="online" />
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-800 leading-tight">{userName}</span>
              <span className="text-[10px] font-semibold text-slate-500">{ROLE_LABEL[userRole] ?? userRole}</span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-500" />
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 glass-dropdown p-2 rounded-2xl shadow-xl z-50">
              <div className="px-3 py-2 border-b border-slate-200/60 mb-1">
                <p className="text-xs font-bold text-slate-800">{userName}</p>
                <p className="text-[11px] text-slate-500 font-medium">{ROLE_LABEL[userRole] ?? userRole}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-left cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-500" />
                <span>Keluar (Logout)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
