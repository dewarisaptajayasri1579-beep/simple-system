"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, Button, Input, Select, Alert, FilterableTable, type FilterableColumn } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";

export interface SystemDevelopmentItemRow {
  id: string;
  title: string;
  description: string | null;
  status: "belum" | "proses" | "selesai";
  createdByName: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = [
  { value: "belum", label: "Belum Dikerjakan" },
  { value: "proses", label: "Sedang Dikerjakan" },
  { value: "selesai", label: "Selesai" },
];

const STATUS_STYLE: Record<SystemDevelopmentItemRow["status"], string> = {
  belum: "bg-slate-100 text-slate-600 border-slate-200",
  proses: "bg-amber-50 text-amber-700 border-amber-200",
  selesai: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export const SystemDevelopmentList: React.FC<{ items: SystemDevelopmentItemRow[]; isOwner: boolean }> = ({ items: initialItems, isOwner }) => {
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!title.trim()) {
      setError("Judul wajib diisi");
      return;
    }
    setIsSaving(true);
    setError("");
    const res = await fetch("/api/system-development", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() }),
    });
    const data = await res.json().catch(() => null);
    setIsSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menambah item");
      return;
    }
    setItems((prev) => [{ ...data, createdAt: data.createdAt }, ...prev]);
    setTitle("");
    setDescription("");
  };

  const handleStatusChange = async (id: string, status: string) => {
    setUpdatingId(id);
    setError("");
    const res = await fetch(`/api/system-development/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => null);
    setUpdatingId(null);
    if (!res.ok) {
      setError(data?.error || "Gagal mengubah status");
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: data.status } : item)));
  };

  const handleDelete = async (id: string, itemTitle: string) => {
    if (!confirm(`Hapus item "${itemTitle}"?`)) return;
    setDeletingId(id);
    setError("");
    const res = await fetch(`/api/system-development/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setDeletingId(null);
    if (!res.ok) {
      setError(data?.error || "Gagal menghapus item");
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const columns: FilterableColumn<SystemDevelopmentItemRow>[] = [
    {
      key: "title",
      header: "Fitur / Perbaikan",
      filterValue: (r) => `${r.title} ${r.description ?? ""}`,
      cell: (r) => (
        <div>
          <p className="font-bold text-slate-900">{r.title}</p>
          {r.description && <p className="text-sm text-slate-600 mt-0.5">{r.description}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      headClassName: "w-56",
      filterValue: (r) => r.status,
      filterOptions: STATUS_OPTIONS,
      cell: (r) => (
        <Select
          sizeVariant="sm"
          options={STATUS_OPTIONS}
          value={r.status}
          onChange={(v) => handleStatusChange(r.id, v)}
          disabled={updatingId === r.id}
          searchable={false}
          className={`font-bold border ${STATUS_STYLE[r.status]}`}
        />
      ),
    },
    {
      key: "meta",
      header: "Dicatat",
      headClassName: "w-40",
      cell: (r) => (
        <div className="text-xs text-slate-500">
          <p className="font-semibold">{r.createdByName ?? "-"}</p>
          <p>{formatDate(r.createdAt)}</p>
        </div>
      ),
    },
    ...(isOwner
      ? [
          {
            key: "aksi",
            header: "",
            headClassName: "w-12",
            cell: (r: SystemDevelopmentItemRow) => (
              <Button
                size="sm"
                variant="ghost"
                isLoading={deletingId === r.id}
                onClick={() => handleDelete(r.id, r.title)}
                aria-label={`Hapus ${r.title}`}
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Usul Item Baru</CardTitle>
          <CardDescription>Fitur atau perbaikan yang mau dikerjakan — mis. &quot;Cetak MOU dari Project&quot;.</CardDescription>
        </CardHeader>
        <div className="space-y-3">
          <Input label="Judul" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Cetak MOU dari Project" />
          <Input
            label="Deskripsi (opsional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="mis. Timeline Pembayaran"
          />
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={handleAdd} isLoading={isSaving} leftIcon={<Plus className="w-4 h-4" />}>
              Tambah
            </Button>
          </div>
        </div>
      </Card>

      <Card variant="panel" padding="none">
        <CardHeader className="p-5 sm:p-6 mb-0">
          <CardTitle>Daftar</CardTitle>
          <CardDescription>{items.length} item</CardDescription>
        </CardHeader>
        <FilterableTable columns={columns} rows={items} rowKey={(r) => r.id} emptyMessage="Belum ada item pengembangan." searchPlaceholder="Cari fitur..." />
      </Card>
    </div>
  );
};
