"use client";

import React, { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button, Input } from "@/components/ui";

/** Nomor ID / Keterangan biaya berkala — klik teksnya buat langsung edit inline,
 *  PATCH ke RecurringBill, tanpa perlu buka Pengaturan > Master Data. */
export const EditableIdentifier: React.FC<{ billId: string; identifier: string | null }> = ({
  billId,
  identifier: initialIdentifier,
}) => {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialIdentifier ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const openEdit = () => {
    setDraft(identifier ?? "");
    setError("");
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/recurring-bills/${billId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: draft.trim() || null }),
      });
      if (!res.ok) throw new Error();
      setIdentifier(draft.trim() || null);
      setIsEditing(false);
    } catch {
      setError("Gagal menyimpan, coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <div className="w-40">
            <Input
              sizeVariant="sm"
              placeholder="Nomor ID / Keterangan"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          </div>
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
      className="inline-flex items-center gap-1.5 text-sm text-slate-700 hover:text-blue-600 transition-colors cursor-pointer group"
    >
      <span>{identifier || <span className="italic text-slate-400">klik isi</span>}</span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};
