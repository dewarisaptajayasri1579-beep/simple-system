"use client";

import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui";

/** PIC + No. HP di bawah nama client — kalau kosong tetap tampil (bukan disembunyikan) supaya
 *  bisa langsung diklik buat diisi. Klik teksnya -> buka modal dengan 2 field (Nama PIC, No. WA)
 *  + tombol Simpan, langsung PATCH ke Client. */
export const EditablePicInfo: React.FC<{
  clientId: string;
  picName: string | null;
  picPhone: string | null;
  onUpdated?: (patch: { picName: string | null; picPhone: string | null }) => void;
}> = ({ clientId, picName: initialPicName, picPhone: initialPicPhone, onUpdated }) => {
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
      const nextPicName = draftName.trim() || null;
      const nextPicPhone = draftPhone.trim() || null;
      setPicName(nextPicName);
      setPicPhone(nextPicPhone);
      setIsEditing(false);
      onUpdated?.({ picName: nextPicName, picPhone: nextPicPhone });
    } catch {
      setError("Gagal menyimpan, coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
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

      <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="Edit PIC" size="sm">
        <div className="space-y-4">
          {error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}
          <Input label="Nama PIC" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="mis. Budi" />
          <Input label="No. WA PIC" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="mis. 08123456789" />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>
              Batal
            </Button>
            <Button type="button" variant="primary" onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
