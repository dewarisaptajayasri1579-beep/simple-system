"use client";

import { LogOut } from "lucide-react";

export const ModuleLogoutButton: React.FC = () => {
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store" });
    } finally {
      document.cookie = "session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.replace("/login");
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
    >
      <LogOut className="w-4 h-4" /> Logout
    </button>
  );
};
