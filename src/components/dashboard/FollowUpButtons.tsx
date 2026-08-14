"use client";

import React, { useEffect, useState } from "react";
import { MessageCircle, Send, Check, X } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";
import { waWebUrl, WA_WEB_WINDOW_NAME } from "@/lib/phone";

interface FollowUpButtonsProps {
  phone: string | null;
  message: string;
  clientId?: string | null;
  clientName?: string | null;
}

/** Dua tombol follow-up WA: "Manual" (buka web.whatsapp.com, staf yang pencet kirim di WhatsApp-nya
 *  sendiri) dan "Otomatis" (kirim langsung dari server lewat WAHUB). Saat nomor WA belum ada,
 *  tombol ini bisa langsung mengisi data pelanggan lewat modal. */
export const FollowUpButtons: React.FC<FollowUpButtonsProps> = ({ phone: initialPhone, message, clientId, clientName }) => {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [phone, setPhone] = useState(initialPhone);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftPhone, setDraftPhone] = useState(initialPhone ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setPhone(initialPhone);
    setDraftPhone(initialPhone ?? "");
  }, [initialPhone]);

  const handleSavePhone = async () => {
    if (!clientId) return;
    const nextPhone = draftPhone.trim();
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picPhone: nextPhone || null, phoneNumber: nextPhone || null }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      setPhone(nextPhone || null);
      setIsModalOpen(false);
    } catch {
      setSaveError("Gagal menyimpan nomor WA pelanggan. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!phone) {
    return (
      <>
        <div className="text-left">
          <div className="flex items-center gap-1.5 opacity-40">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100"
              title="Klik untuk lengkapi No WA"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100"
              title="Klik untuk lengkapi No WA"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="mt-1 inline-flex items-center text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:underline"
            title="Klik untuk lengkapi No WA"
          >
            Klik untuk lengkapi No WA
          </button>
        </div>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={clientName ? `Lengkapi No WA ${clientName}` : "Lengkapi No WA"}>
          <div className="space-y-4">
            <Input
              label="No. WA pelanggan"
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder="Contoh: 6281234567890"
            />
            <p className="text-xs text-slate-500">Nomor ini akan langsung tersimpan ke data pelanggan dan muncul di dashboard.</p>
            {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                Batal
              </Button>
              <Button variant="primary" onClick={handleSavePhone} isLoading={isSaving}>
                Simpan
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  const waMeUrl = waWebUrl(phone, message);

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
        target={WA_WEB_WINDOW_NAME}
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
