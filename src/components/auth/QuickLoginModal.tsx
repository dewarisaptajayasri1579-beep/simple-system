"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Modal } from "../ui";

interface OwnerOption {
  id: string;
  name: string;
}

/** Modal "Login sebagai siapa?" — login cepat tanpa password, khusus role owner. Cuma muncul
 *  kalau dibuka lewat link laporan dashboard di WA Grup ops (?quick=1), bukan dari halaman
 *  login biasa — WA tidak bisa kasih tahu ini diklik dari nomor siapa, jadi user milih sendiri
 *  identitasnya. Grup itu cuma berisi Owner yang sama, jadi ini dianggap cukup aman. */
export const QuickLoginModal: React.FC<{ open: boolean; onManualLogin: () => void }> = ({ open, onManualLogin }) => {
  const router = useRouter();
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/auth/quick-login")
      .then((r) => r.json())
      .then((data) => setOwners(data.users ?? []))
      .catch(() => {});
  }, [open]);

  const handlePick = async (userId: string) => {
    setLoadingId(userId);
    setError("");
    try {
      const res = await fetch("/api/auth/quick-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Gagal login");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal login");
      setLoadingId(null);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onManualLogin}
      title="Login sebagai siapa?"
      subtitle="Link laporan dashboard ini khusus buat internal — pilih akunmu, tidak perlu password."
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        {error && <p className="text-xs font-semibold text-rose-600 text-center">{error}</p>}

        <div className="grid grid-cols-3 gap-3">
          {owners.map((owner) => (
            <button
              key={owner.id}
              type="button"
              onClick={() => handlePick(owner.id)}
              disabled={loadingId !== null}
              className="flex flex-col items-center gap-2 px-3 py-4 rounded-2xl bg-white/70 hover:bg-white border border-slate-200/80 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-11 h-11 rounded-full bg-[#f0f5ff] text-[#0544cc] border border-blue-100 flex items-center justify-center">
                <UserRound className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-700 truncate max-w-full">
                {loadingId === owner.id ? "..." : owner.name}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onManualLogin}
          className="w-full text-center text-xs font-semibold text-slate-500 hover:text-blue-700 cursor-pointer pt-1"
        >
          Login pakai email &amp; password
        </button>
      </div>
    </Modal>
  );
};
