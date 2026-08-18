"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Alert } from "@/components/ui";

/** Tombol "Nonaktifkan" di kolom Aksi Dashboard > Domain — minta alasan dulu (wajib), dicatat
 *  di DeactivationLog (Pengaturan > Log Nonaktif), lalu domain langsung hilang dari Dashboard
 *  begitu halaman di-refresh (query Dashboard selalu filter active:true). */
export const DeactivateDomainButton: React.FC<{ domainId: string; domainName: string }> = ({ domainId, domainName }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openModal = () => {
    setReason("");
    setError("");
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Alasan nonaktif wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/domains/${domainId}/deactivate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menonaktifkan domain");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={openModal}>
        Nonaktifkan
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Nonaktifkan Domain" subtitle={domainName}>
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <p className="text-sm text-slate-600">
            Domain ini langsung hilang dari Dashboard begitu dinonaktifkan. Tercatat di <strong>Log Nonaktif</strong> (Pengaturan).
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs sm:text-sm font-bold text-slate-700">Alasan nonaktif</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Mis. domain sudah tidak dipakai client, pindah provider, dsb."
              className="w-full rounded-xl px-3 py-2 text-sm bg-white/60 hover:bg-white/80 border border-slate-200/80 text-slate-800 placeholder:text-slate-400 font-medium transition-all duration-200 focus:outline-none focus:bg-white/95 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button size="sm" variant="primary" className="bg-rose-600 hover:bg-rose-700" onClick={handleSubmit} isLoading={saving}>
              Nonaktifkan
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
