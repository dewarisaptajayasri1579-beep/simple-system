"use client";

import React, { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button, Input } from "@/components/ui";

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Arsip No. & Tanggal Bukti Pungut PPN untuk invoice ke client Pemungut PPN (lihat
 *  Client.isPemungutPpn) — cuma catatan, tidak ada efek jurnal. Sama pola click-to-edit
 *  dengan EditablePicInfo. */
export const EditableBuktiPungutPpn: React.FC<{
  invoiceId: string;
  noBuktiPungutPpn: string | null;
  tglBuktiPungutPpn: string | null;
}> = ({ invoiceId, noBuktiPungutPpn: initialNo, tglBuktiPungutPpn: initialTgl }) => {
  const [noBukti, setNoBukti] = useState(initialNo);
  const [tglBukti, setTglBukti] = useState(initialTgl);
  const [isEditing, setIsEditing] = useState(false);
  const [draftNo, setDraftNo] = useState(initialNo ?? "");
  const [draftTgl, setDraftTgl] = useState(toDateInput(initialTgl));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const openEdit = () => {
    setDraftNo(noBukti ?? "");
    setDraftTgl(toDateInput(tglBukti));
    setError("");
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/bukti-pungut`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noBuktiPungutPpn: draftNo.trim() || null, tglBuktiPungutPpn: draftTgl || null }),
      });
      if (!res.ok) throw new Error();
      setNoBukti(draftNo.trim() || null);
      setTglBukti(draftTgl || null);
      setIsEditing(false);
    } catch {
      setError("Gagal menyimpan, coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-md">
        <Input sizeVariant="sm" placeholder="No. Bukti Pungut PPN" value={draftNo} onChange={(e) => setDraftNo(e.target.value)} />
        <Input sizeVariant="sm" type="date" value={draftTgl} onChange={(e) => setDraftTgl(e.target.value)} />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button size="sm" variant="primary" onClick={handleSave} isLoading={isSaving}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openEdit}
      className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors cursor-pointer group"
    >
      <span>
        Bukti Pungut PPN: {noBukti || <span className="italic text-slate-400">klik isi</span>}
        {tglBukti && ` · ${formatDate(tglBukti)}`}
      </span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};
