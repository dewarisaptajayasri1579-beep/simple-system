"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

export interface EditableDateCellProps {
  /** Endpoint PATCH lengkap, mis. `/api/domains/${id}` atau `/api/servers/${id}`. */
  apiPath: string;
  /** Nama field yang di-PATCH, mis. "lastPaidAt" atau "expiryDate". */
  field: string;
  value: string | null;
  formatDate: (d: Date | null) => string;
  onUpdated: (value: string | null) => void;
  title?: string;
}

/** Tanggal yang bisa diedit inline (klik -> jadi input date) — dipakai di Master Data Domain
 *  ("Terakhir Bayar"/"Tgl Berakhir") dan Server ("Terakhir Bayar"/"Tgl Berakhir"). Generik lewat
 *  `apiPath`, bukan spesifik 1 modul. */
export const EditableDateCell: React.FC<EditableDateCellProps> = ({ apiPath, field, value: initialValue, formatDate, onUpdated, title }) => {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ? initialValue.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    const res = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value || null }),
    });
    if (res.ok) {
      const data = await res.json();
      onUpdated(data[field] ?? null);
      router.refresh();
    }
    setSaving(false);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(initialValue ? initialValue.slice(0, 10) : "");
        setEditing(true);
      }}
      className="inline-flex items-center gap-1.5 text-left hover:text-[#0544cc] cursor-pointer group"
      title={title ?? "Klik untuk ubah tanggal"}
    >
      <span>{formatDate(initialValue ? new Date(initialValue) : null)}</span>
      <Pencil size={12} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
    </button>
  );
};
