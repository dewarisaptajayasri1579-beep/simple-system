"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { CurrencyInput } from "@/components/ui";

export interface EditableCurrencyCellProps {
  /** Endpoint PATCH lengkap, mis. `/api/domains/${id}` atau `/api/servers/${id}`. */
  apiPath: string;
  /** Nama field yang di-PATCH, mis. "sellPrice" atau "price". */
  field: string;
  value: number | null;
  formatRupiah: (n: number | null) => string;
  onUpdated: (value: number | null) => void;
  title?: string;
}

/** Nominal uang yang bisa diedit inline (klik -> jadi CurrencyInput) — sama pola dengan
 *  EditableDateCell, generik lewat `apiPath`+`field`, dipakai buat Harga Jual Domain/Server dkk. */
export const EditableCurrencyCell: React.FC<EditableCurrencyCellProps> = ({ apiPath, field, value: initialValue, formatRupiah, onUpdated, title }) => {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? 0);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    const res = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
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
      <CurrencyInput
        sizeVariant="sm"
        autoFocus
        value={value}
        disabled={saving}
        onChange={setValue}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="max-w-[9rem]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setValue(initialValue ?? 0);
        setEditing(true);
      }}
      className="inline-flex items-center gap-1.5 text-left hover:text-[#0544cc] cursor-pointer group"
      title={title ?? "Klik untuk ubah harga"}
    >
      <span>{formatRupiah(initialValue)}</span>
      <Pencil size={12} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
    </button>
  );
};
