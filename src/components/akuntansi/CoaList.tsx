"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, Button, Modal, Input, Select, Alert, FilterableTable, type FilterableColumn } from "@/components/ui";
import { Plus, PlusCircle, Pencil, ChevronDown, ChevronRight } from "lucide-react";

export interface CoaRow {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  isParent: boolean;
  parentId: string | null;
  parentName: string | null;
  saldoAkhir: number;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

/** COA itu recursive (self-relation parentId, bisa berlapis berapa level pun — mis. Aset >
 *  Kas & Bank > Kas Utama = 3 level). Urutkan depth-first per cabang (bukan cuma sort by
 *  code) supaya anak selalu nempel persis di bawah induknya, lalu catat depth tiap baris
 *  buat indentasi visual di kolom Nama Akun. */
function buildTree(rows: CoaRow[]): { row: CoaRow; depth: number }[] {
  const byParent = new Map<string | null, CoaRow[]>();
  for (const r of rows) {
    const key = r.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.code.localeCompare(b.code));

  const result: { row: CoaRow; depth: number }[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number) => {
    for (const child of byParent.get(parentId) ?? []) {
      if (visited.has(child.id)) continue; // jaga-jaga kalau ada parentId nyasar jadi siklus
      visited.add(child.id);
      result.push({ row: child, depth });
      visit(child.id, depth + 1);
    }
  };
  visit(null, 0);
  // Baris yang parentId-nya nunjuk ke akun yang tidak ada di daftar (seharusnya tidak terjadi) —
  // tetap ditampilkan di root supaya tidak hilang diam-diam.
  for (const r of rows) {
    if (!visited.has(r.id)) result.push({ row: r, depth: 0 });
  }
  return result;
}

const TYPE_LABEL: Record<string, string> = {
  asset: "Aset",
  liability: "Liabilitas",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  cogs: "HPP",
  expense: "Beban",
};

const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));

/** Kode anak = kode induk dengan segmen terakhir dinaikkan dari sibling tertinggi (atau dari
 *  kode induk sendiri kalau belum ada anak) — pola yang sama dipakai scripts/seed-coa.ts saat
 *  backfill akun kas/bank (1-1000 -> 1-1001, 1-1002, dst). */
function nextChildCode(parent: CoaRow, allRows: CoaRow[]): string {
  const [prefix, suffixRaw] = parent.code.split("-");
  const parentNum = Number(suffixRaw);
  if (Number.isNaN(parentNum)) return "";
  const siblingNums = allRows
    .filter((r) => r.parentId === parent.id && r.code.startsWith(`${prefix}-`))
    .map((r) => Number(r.code.split("-")[1]))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);

  // Jarak antar kode (step) diambil dari anak pertama — level atas biasanya loncat besar
  // (mis. 6-0000 -> 6-1000, 6-2000, ... = step 1000), level di bawahnya biasa naik 1
  // (mis. 6-1000 -> 6-1001, 6-1002). Anak yang menyimpang dari kelipatan step ini (ditambah
  // manual di luar pola, mis. 6-6001 nyempil di antara kelipatan 1000) diabaikan waktu cari
  // kode "on-grid" berikutnya, supaya penomoran level ini tidak ikut melenceng ke pola anaknya.
  const step = siblingNums.length > 0 ? siblingNums[0] - parentNum : 1;
  const effectiveStep = step > 0 ? step : 1;
  const onGridNums = siblingNums.filter((n) => (n - parentNum) % effectiveStep === 0);
  let nextNum = (onGridNums.length > 0 ? Math.max(...onGridNums) : parentNum) + effectiveStep;

  // Tetap jaga-jaga: kalau kode "on-grid" itu kebetulan sudah kepakai di cabang lain pohon
  // COA, lompat lagi per step sampai ketemu yang benar-benar kosong.
  const usedCodes = new Set(allRows.map((r) => r.code));
  let candidate = `${prefix}-${String(nextNum).padStart(suffixRaw.length, "0")}`;
  while (usedCodes.has(candidate)) {
    nextNum += effectiveStep;
    candidate = `${prefix}-${String(nextNum).padStart(suffixRaw.length, "0")}`;
  }
  return candidate;
}

export const CoaList: React.FC<{ rows: CoaRow[]; isOwner: boolean; month: string }> = ({ rows: initialRows, isOwner, month }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState(initialRows);
  const [monthValue, setMonthValue] = useState(month);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("expense");
  const [parentId, setParentId] = useState("");
  const [isParentField, setIsParentField] = useState(false);
  const [lockedFields, setLockedFields] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const tree = useMemo(() => buildTree(rows), [rows]);
  const depthById = useMemo(() => new Map(tree.map((t) => [t.row.id, t.depth])), [tree]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  // Akun yang sudah jadi induk (punya anak) — dipakai buat badge "Parent" dan syarat boleh
  // tambah anak lagi (akun berdaun/leaf cuma boleh diubah jadi induk kalau belum ada saldonya).
  const hasChildrenById = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.parentId) set.add(r.parentId);
    return set;
  }, [rows]);

  // Expand/collapse per induk — default semua TERTUTUP begitu halaman dibuka (COA bisa
  // berlapis dalam & bikin daftar kepanjangan kalau langsung kebuka semua). Nutup satu induk
  // otomatis nyembunyiin seluruh keturunannya (bukan cuma anak langsung), dicek lewat rantai
  // parentId ke atas.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(initialRows.filter((r) => r.parentId).map((r) => r.parentId as string))
  );
  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const isHiddenByCollapse = (row: CoaRow) => {
    let currentParentId = row.parentId;
    while (currentParentId) {
      if (collapsedIds.has(currentParentId)) return true;
      currentParentId = rowById.get(currentParentId)?.parentId ?? null;
    }
    return false;
  };
  const treeRows = useMemo(() => tree.filter((t) => !isHiddenByCollapse(t.row)).map((t) => t.row), [tree, collapsedIds, rowById]);

  // Dropdown "Induk" ikut nampilin hierarki (indentasi) biar kelihatan levelnya — akun mana
  // pun boleh dipilih jadi induk, termasuk yang sudah punya anak sendiri (nested tanpa batas).
  const parentOptions = useMemo(
    () => tree.map((t) => ({ value: t.row.id, label: `${"— ".repeat(t.depth)}${t.row.code} — ${t.row.name}` })),
    [tree]
  );

  const applyMonth = (value: string) => {
    setMonthValue(value);
    router.push(`${pathname}?month=${value}`);
  };

  const openCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setCode("");
    setName("");
    setType("expense");
    setParentId("");
    setIsParentField(false);
    setLockedFields(false);
    setError("");
  };

  /** Dipicu dari tombol "+" di baris — Kode/Jenis/Induk otomatis mengikuti induknya, cuma
   *  Nama Akun yang diisi manual. */
  const openCreateChild = (parent: CoaRow) => {
    setIsCreating(true);
    setEditingId(null);
    setCode(nextChildCode(parent, rows));
    setName("");
    setType(parent.type);
    setParentId(parent.id);
    setIsParentField(false);
    setLockedFields(true);
    setError("");
  };

  const openEdit = (row: CoaRow) => {
    setIsCreating(true);
    setEditingId(row.id);
    setCode(row.code);
    setName(row.name);
    setType(row.type);
    setParentId(row.parentId ?? "");
    setIsParentField(row.isParent);
    setLockedFields(false);
    setError("");
  };

  const close = () => {
    setIsCreating(false);
    setEditingId(null);
  };

  const presetParent = rows.find((r) => r.id === parentId);

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      setError("Kode dan nama akun wajib diisi");
      return;
    }
    setIsSaving(true);
    setError("");
    const url = editingId ? `/api/coa/${editingId}` : "/api/coa";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), name: name.trim(), type, parentId: parentId || null, isParent: isParentField }),
    });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan");
      return;
    }
    if (editingId) {
      setRows((prev) =>
        prev.map((r) => (r.id === editingId ? { ...r, name: data.name, type: data.type, parentId: data.parentId, isParent: data.isParent } : r))
      );
    } else {
      setRows((prev) => [...prev, { ...data, parentName: null, saldoAkhir: 0 }].sort((a, b) => a.code.localeCompare(b.code)));
    }
    close();
    router.refresh();
  };

  const columns: FilterableColumn<CoaRow>[] = [
    {
      key: "code",
      header: "Kode",
      cellClassName: "font-mono font-semibold",
      cell: (r) => {
        const depth = depthById.get(r.id) ?? 0;
        const hasChildren = hasChildrenById.has(r.id);
        return (
          <span style={{ paddingLeft: depth * 20 }} className="inline-flex items-center gap-1.5">
            {hasChildren ? (
              <button
                onClick={() => toggleCollapse(r.id)}
                title={collapsedIds.has(r.id) ? "Buka sub-akun" : "Tutup sub-akun"}
                className="text-slate-400 hover:text-[#0544cc] cursor-pointer flex-shrink-0"
              >
                {collapsedIds.has(r.id) ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            ) : (
              depth > 0 && <span className="w-4 flex-shrink-0" />
            )}
            {depth > 0 && <span className="text-slate-300">└</span>}
            {r.code}
            {isOwner && r.isParent && (
              <button
                onClick={() => openCreateChild(r)}
                title="Tambah sub-akun di bawah ini"
                className="text-slate-400 hover:text-[#0544cc] cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            )}
          </span>
        );
      },
    },
    {
      key: "name",
      header: "Nama Akun",
      cellClassName: "font-semibold",
      cell: (r) => {
        const depth = depthById.get(r.id) ?? 0;
        const hasChildren = hasChildrenById.has(r.id);
        return (
          <span style={{ paddingLeft: depth * 20 }} className="inline-flex items-center gap-2">
            {r.name}
            {hasChildren && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200">
                Parent
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "saldo",
      header: "Saldo",
      cellClassName: "font-semibold text-right",
      cell: (r) => formatRupiah(r.saldoAkhir),
    },
    {
      key: "aksi",
      header: "",
      cell: (r) => (
        <div className="flex items-center gap-3">
          {isOwner && (
            <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-[#0544cc] cursor-pointer" title="Edit akun">
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <Link href={`/akuntansi/buku-besar?accountId=${r.id}&month=${monthValue}`} className="text-sm font-bold text-[#0544cc] hover:underline">
            Detail
          </Link>
        </div>
      ),
    },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <CardHeader className="p-0 mb-0">
            <CardTitle>Daftar Akun</CardTitle>
            <CardDescription>{rows.length} akun · saldo per akhir bulan terpilih</CardDescription>
          </CardHeader>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Input label="Bulan" type="month" sizeVariant="sm" value={monthValue} onChange={(e) => applyMonth(e.target.value)} />
          {isOwner && (
            <Button size="sm" variant="outline" onClick={() => openCreate()} leftIcon={<Plus className="w-4 h-4" />}>
              Tambah Akun
            </Button>
          )}
        </div>
      </div>
      <FilterableTable columns={columns} rows={treeRows} rowKey={(r) => r.id} pageSize={100} emptyMessage="Belum ada akun." />

      <Modal
        isOpen={isCreating}
        onClose={close}
        title={editingId ? `Edit ${code} — ${name}` : presetParent ? `Sub-akun dari ${presetParent.code} — ${presetParent.name}` : "Akun Baru"}
      >
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Input
            label="Kode Akun"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="mis. 6-5000"
            disabled={lockedFields || editingId !== null}
          />
          <Input label="Nama Akun" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Beban Marketing" />
          <Select label="Jenis" options={TYPE_OPTIONS} value={type} onChange={setType} disabled={lockedFields} />
          <Select
            label="Induk (opsional)"
            options={parentOptions}
            value={parentId}
            onChange={setParentId}
            placeholder="Tanpa induk — jadi akun level teratas"
            disabled={lockedFields}
          />
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={isParentField} onChange={(e) => setIsParentField(e.target.checked)} className="w-5 h-5" />
            <span className="text-sm font-semibold text-slate-700">As Parent — boleh ditambahi sub-akun</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
