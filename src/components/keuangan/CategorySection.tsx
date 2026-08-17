"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
  Alert,
  FilterableTable,
  type FilterableColumn,
} from "@/components/ui";
import { Plus, Trash2, Combine } from "lucide-react";

interface CategoryRow {
  id: string;
  name: string;
  kind: "income" | "expense" | "hpp";
  coaAccountId: string | null;
  coaAccount: { code: string; name: string } | null;
  _count: { transactions: number };
}

interface CoaRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
}

const KIND_LABEL: Record<CategoryRow["kind"], string> = {
  income: "Pendapatan",
  expense: "Biaya",
  hpp: "HPP",
};

const KIND_TO_COA_TYPE: Record<CategoryRow["kind"], string> = {
  income: "revenue",
  expense: "expense",
  hpp: "cogs",
};

const KindTable: React.FC<{
  kind: CategoryRow["kind"];
  rows: CategoryRow[];
  coaOptions: { value: string; label: string }[];
  canEdit: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onSetCoa: (id: string, coaAccountId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMerge: (sourceIds: string[], targetId: string) => Promise<void>;
  onAdd: (name: string) => Promise<void>;
}> = ({ kind, rows, coaOptions, canEdit, onRename, onSetCoa, onDelete, onMerge, onAdd }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const mergeOptions = selectedRows.map((r) => ({ value: r.id, label: r.name }));

  const handleMerge = async () => {
    if (!mergeTargetId || selected.size < 2) return;
    setIsMerging(true);
    try {
      await onMerge(Array.from(selected).filter((id) => id !== mergeTargetId), mergeTargetId);
      setSelected(new Set());
      setMergeTargetId("");
    } finally {
      setIsMerging(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAdd(newName.trim());
    setNewName("");
  };

  const columns: FilterableColumn<CategoryRow>[] = [
    ...(canEdit
      ? [
          {
            key: "select",
            header: "",
            headClassName: "w-10",
            cell: (r: CategoryRow) => (
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggleSelected(r.id)}
                className="w-4 h-4 cursor-pointer"
                aria-label={`Pilih ${r.name} untuk digabung`}
              />
            ),
          },
        ]
      : []),
    {
      key: "name",
      header: "Nama",
      filterValue: (r) => r.name,
      cellClassName: "font-semibold",
      cell: (r) =>
        !canEdit ? (
          r.name
        ) : editingId === r.id ? (
          <div className="flex items-center gap-2">
            <Input sizeVariant="sm" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                await onRename(r.id, editingName);
                setEditingId(null);
              }}
            >
              Simpan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
              Batal
            </Button>
          </div>
        ) : (
          <button
            className="text-left hover:underline cursor-pointer"
            onClick={() => {
              setEditingId(r.id);
              setEditingName(r.name);
            }}
          >
            {r.name}
          </button>
        ),
    },
    {
      key: "coa",
      header: "COA",
      cellClassName: "min-w-[220px]",
      cell: (r) =>
        canEdit ? (
          <Select
            sizeVariant="sm"
            options={coaOptions}
            value={r.coaAccountId ?? ""}
            onChange={(v) => onSetCoa(r.id, v)}
            placeholder="Belum dipetakan — jatuh ke Lain-lain"
            searchPlaceholder="Cari akun..."
          />
        ) : r.coaAccount ? (
          `${r.coaAccount.code} — ${r.coaAccount.name}`
        ) : (
          "Belum dipetakan — jatuh ke Lain-lain"
        ),
    },
    {
      key: "usage",
      header: "Transaksi",
      cell: (r) => <span className="text-slate-600 font-semibold">{r._count.transactions}</span>,
    },
    ...(canEdit
      ? [
          {
            key: "aksi",
            header: "Aksi",
            cell: (r: CategoryRow) =>
              r._count.transactions === 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={busyId === r.id}
                  onClick={async () => {
                    setBusyId(r.id);
                    try {
                      await onDelete(r.id);
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </Button>
              ) : (
                <span className="text-xs text-slate-400">dipakai</span>
              ),
          },
        ]
      : []),
  ];

  return (
    <Card variant="panel" padding="none">
      <CardHeader className="p-5 sm:p-6 mb-0">
        <CardTitle>{KIND_LABEL[kind]}</CardTitle>
        <CardDescription>
          {rows.length} kategori — centang 2+ untuk gabung kategori duplikat (transaksi lama ikut pindah).
        </CardDescription>
      </CardHeader>

      {canEdit && selected.size >= 2 && (
        <div className="mx-5 sm:mx-6 mb-4 p-3 rounded-xl bg-blue-50 border border-blue-200 flex flex-wrap items-center gap-3">
          <Combine className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-blue-800">{selected.size} kategori dipilih — gabung ke:</span>
          <div className="w-56">
            <Select sizeVariant="sm" options={mergeOptions} value={mergeTargetId} onChange={setMergeTargetId} placeholder="Pilih kategori tujuan" searchable={false} />
          </div>
          <Button size="sm" variant="primary" onClick={handleMerge} isLoading={isMerging} disabled={!mergeTargetId}>
            Gabung
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Batal
          </Button>
        </div>
      )}

      <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage={`Belum ada kategori ${KIND_LABEL[kind].toLowerCase()}.`} />

      {canEdit && (
        <div className="flex gap-2 p-5 sm:p-6 pt-4 border-t border-slate-200/60">
          <Input sizeVariant="sm" placeholder={`Kategori ${KIND_LABEL[kind].toLowerCase()} baru`} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button size="sm" variant="outline" onClick={handleAdd} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah
          </Button>
        </div>
      )}
    </Card>
  );
};

export const CategorySection: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/coa").then((r) => r.json()),
    ])
      .then(([cats, coa]) => {
        if (Array.isArray(cats)) setCategories(cats);
        if (Array.isArray(coa)) setCoaAccounts(coa);
      })
      .catch(() => setError("Gagal memuat data kategori"))
      .finally(() => setLoading(false));
  }, []);

  const coaOptionsByKind = useMemo(() => {
    const grouped: Record<CategoryRow["kind"], { value: string; label: string }[]> = { income: [], expense: [], hpp: [] };
    for (const kind of Object.keys(KIND_TO_COA_TYPE) as CategoryRow["kind"][]) {
      grouped[kind] = coaAccounts
        .filter((c) => c.type === KIND_TO_COA_TYPE[kind] && c.parentId !== null)
        .map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }));
    }
    return grouped;
  }, [coaAccounts]);

  const handleRename = async (id: string, name: string) => {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Gagal mengganti nama kategori");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
  };

  const handleSetCoa = async (id: string, coaAccountId: string) => {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coaAccountId: coaAccountId || null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Gagal memetakan COA");
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Gagal menghapus kategori");
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const handleMerge = async (sourceIds: string[], targetId: string) => {
    const res = await fetch("/api/categories/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceIds, targetId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Gagal menggabung kategori");
      return;
    }
    setCategories((prev) =>
      prev
        .filter((c) => !sourceIds.includes(c.id))
        .map((c) => (c.id === targetId ? { ...c, _count: { transactions: c._count.transactions } } : c))
    );
    // Jumlah transaksi kategori tujuan berubah di server (kebagian transaksi dari sumber) —
    // ambil ulang biar akurat daripada menjumlahkan manual di client.
    const refreshed = await fetch("/api/categories").then((r) => r.json()).catch(() => null);
    if (Array.isArray(refreshed)) setCategories(refreshed);
  };

  const handleAdd = async (kind: CategoryRow["kind"], name: string) => {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Gagal menambah kategori");
      return;
    }
    setCategories((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, { ...data, coaAccount: null, _count: { transactions: 0 } }]));
  };

  if (loading) {
    return (
      <Card variant="panel" padding="lg">
        <p className="text-sm text-slate-500">Memuat kategori...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {(["expense", "income", "hpp"] as const).map((kind) => (
        <KindTable
          key={kind}
          kind={kind}
          rows={categories.filter((c) => c.kind === kind)}
          coaOptions={coaOptionsByKind[kind]}
          canEdit={canEdit}
          onRename={handleRename}
          onSetCoa={handleSetCoa}
          onDelete={handleDelete}
          onMerge={handleMerge}
          onAdd={(name) => handleAdd(kind, name)}
        />
      ))}
    </div>
  );
};
