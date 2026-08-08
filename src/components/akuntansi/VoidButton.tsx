"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Alert } from "@/components/ui";

export interface VoidButtonProps {
  voidUrl: string;
  itemLabel: string;
  size?: "sm" | "md";
  onVoided?: () => void;
}

/** Tombol "Batalkan" untuk transaksi yang sudah Posted tapi ternyata salah input — bukan
 *  edit/hapus langsung (itu terkunci begitu posted), tapi menandai "Dibatalkan" (dikecualikan
 *  dari saldo/laporan, tetap ada di riwayat). Selalu minta konfirmasi + alasan opsional
 *  sebelum jalan, karena ini aksi yang mengubah laporan yang sudah final. */
export const VoidButton: React.FC<VoidButtonProps> = ({ voidUrl, itemLabel, size = "sm", onVoided }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleVoid = async () => {
    setSaving(true);
    setError("");
    const res = await fetch(voidUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal membatalkan");
      return;
    }
    setOpen(false);
    setReason("");
    onVoided?.();
    router.refresh();
  };

  return (
    <>
      <Button size={size} variant="outline" className="!text-rose-700 !border-rose-300 hover:!bg-rose-50" onClick={() => setOpen(true)}>
        Batalkan
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Batalkan Transaksi" subtitle={`Batalkan ${itemLabel}? Efeknya (piutang/saldo/laporan) akan dibalik, tapi datanya tetap tersimpan di riwayat dengan status "Dibatalkan".`}>
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <div>
            <label className="text-xs sm:text-sm font-bold text-slate-700 mb-1.5 block">Alasan (opsional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="mis. salah input nominal"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" className="!bg-rose-600 hover:!bg-rose-700" onClick={handleVoid} isLoading={saving}>
              Ya, Batalkan
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
