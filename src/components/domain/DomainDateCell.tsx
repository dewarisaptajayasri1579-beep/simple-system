"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

export interface DomainDateCellProps {
  domainId: string;
  /** Field yang di-PATCH — "lastPaidAt" (kapan terakhir dibayar) atau "expiryDate" (kapan
   *  servicenya berakhir, acuan renewal). Dua hal beda, lihat catatan di schema.prisma. */
  field: "lastPaidAt" | "expiryDate";
  value: string | null;
  formatDate: (d: Date | null) => string;
  onUpdated: (value: string | null) => void;
  title?: string;
}

export const DomainDateCell: React.FC<DomainDateCellProps> = ({ domainId, field, value: initialValue, formatDate, onUpdated, title }) => {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ? initialValue.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    const res = await fetch(`/api/domains/${domainId}`, {
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
