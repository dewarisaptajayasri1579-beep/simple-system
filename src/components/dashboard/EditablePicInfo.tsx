"use client";

import React, { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button, Input } from "@/components/ui";

/** PIC + No. HP di bawah nama client — kalau kosong tetap tampil (bukan disembunyikan) supaya
 *  bisa langsung diklik buat diisi. Klik teksnya -> jadi 2 input kecil + simpan, langsung
 *  PATCH ke Client, tanpa perlu buka halaman/modal terpisah. */
export const EditablePicInfo: React.FC<{ clientId: string; picName: string | null; picPhone: string | null }> = ({
  clientId,
  picName: initialPicName,
  picPhone: initialPicPhone,
}) => {
  const [picName, setPicName] = useState(initialPicName);
  const [picPhone, setPicPhone] = useState(initialPicPhone);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(initialPicName ?? "");
  const [draftPhone, setDraftPhone] = useState(initialPicPhone ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const openEdit = () => {
    setDraftName(picName ?? "");
    setDraftPhone(picPhone ?? "");
    setError("");
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picName: draftName.trim() || null, picPhone: draftPhone.trim() || null }),
      });
      if (!res.ok) throw new Error();
      setPicName(draftName.trim() || null);
      setPicPhone(draftPhone.trim() || null);
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
        <Input sizeVariant="sm" placeholder="Nama PIC" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        <Input sizeVariant="sm" placeholder="No. HP PIC" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} />
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
        PIC: {picName || <span className="italic text-slate-400">klik isi</span>} · No. HP:{" "}
        {picPhone || <span className="italic text-slate-400">klik isi</span>}
      </span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};
