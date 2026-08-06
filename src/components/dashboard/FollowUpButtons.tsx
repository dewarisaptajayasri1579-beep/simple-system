"use client";

import React, { useState } from "react";
import { MessageCircle, Send, Check, X } from "lucide-react";

function normalizePhoneForWaMe(raw: string) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

/** Dua tombol follow-up WA: "Manual" (buka wa.me, staf yang pencet kirim di app WhatsApp-nya
 *  sendiri) dan "Otomatis" (kirim langsung dari server lewat WAHUB). Disabled kalau nomor WA
 *  client/PIC belum diisi, dengan keterangan singkat di bawahnya. */
export const FollowUpButtons: React.FC<{ phone: string | null; message: string }> = ({ phone, message }) => {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (!phone) {
    return (
      <div className="text-left">
        <div className="flex items-center gap-1.5 opacity-40">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100">
            <MessageCircle className="w-4 h-4" />
          </span>
          <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100">
            <Send className="w-4 h-4" />
          </span>
        </div>
        <p className="text-[10px] font-semibold text-rose-600 mt-1">No WA belum lengkap</p>
      </div>
    );
  }

  const waMeUrl = `https://wa.me/${normalizePhoneForWaMe(phone)}?text=${encodeURIComponent(message)}`;

  const handleAuto = async () => {
    setStatus("sending");
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      if (!res.ok) throw new Error();
      setStatus("sent");
    } catch {
      setStatus("error");
    } finally {
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={waMeUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Follow Up Manual — buka WhatsApp"
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
      >
        <MessageCircle className="w-4 h-4" />
      </a>
      <button
        type="button"
        title="Follow Up Otomatis — kirim lewat WAHUB"
        onClick={handleAuto}
        disabled={status === "sending"}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:cursor-wait ${
          status === "sent"
            ? "bg-emerald-100 text-emerald-700"
            : status === "error"
              ? "bg-rose-100 text-rose-700"
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
        }`}
      >
        {status === "sent" ? <Check className="w-4 h-4" /> : status === "error" ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
};
