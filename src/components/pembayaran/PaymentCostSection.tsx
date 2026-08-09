"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, Input, CurrencyInput, Alert, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui";
import { Plus } from "lucide-react";
import { EditableCostAccount, EditableCostAmount } from "./EditableCostRow";

export interface CostItemOption {
  id: string;
  name: string;
  price: number | null;
  clientName: string | null;
}

interface CostTransactionRow {
  id: string;
  description: string | null;
  accountId: string;
  account: { name: string };
  grossAmount: number;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

type Kind = "manual" | "domain" | "server" | "maintenance";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "manual", label: "Biaya Manual" },
  { value: "domain", label: "Bayar Domain" },
  { value: "server", label: "Bayar Server" },
  { value: "maintenance", label: "Bayar Maintenance" },
];

/** Tabel "Biaya" di kwitansi Pembayaran — baris domain/server/maintenance yang dikaitkan ke
 *  payment ini, atau biaya manual (kategori bebas, tidak terkait item master data apa pun).
 *  Bisa diedit per baris (kalau masih draft, lihat EditableCostRow), DAN bisa ditambah baris
 *  baru langsung dari sini (misal staf lupa kaitkan biaya waktu bikin Pelunasan, atau mau
 *  bayar lebih dari 1 item sekaligus dari kas yang sama). */
export const PaymentCostSection: React.FC<{
  paymentId: string;
  costTransactions: CostTransactionRow[];
  canEdit: boolean;
  domains: CostItemOption[];
  servers: CostItemOption[];
  maintenances: CostItemOption[];
}> = ({ paymentId, costTransactions, canEdit, domains, servers, maintenances }) => {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>("manual");
  const [itemId, setItemId] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adding) return;
    fetch("/api/categories?kind=expense")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setCategoryOptions(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))))
      .catch(() => {});
  }, [adding]);

  const itemsByKind = { manual: [], domain: domains, server: servers, maintenance: maintenances }[kind];
  const itemOptions = itemsByKind.map((i) => ({
    value: i.id,
    label: `${i.name}${i.clientName ? ` — ${i.clientName}` : ""} · ${formatRupiah(i.price ?? 0)}`,
  }));

  const openAdd = () => {
    setAdding(true);
    setKind("manual");
    setItemId("");
    setDescription("");
    setCategoryId("");
    setAmount(0);
    setError("");
  };

  const handleCreateCategory = async (name: string) => {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind: "expense" }),
    });
    const cat = await res.json().catch(() => null);
    if (!res.ok || !cat?.id) return null;
    const newOption = { value: cat.id as string, label: cat.name as string };
    setCategoryOptions((prev) => (prev.some((o) => o.value === newOption.value) ? prev : [...prev, newOption].sort((a, b) => a.label.localeCompare(b.label))));
    return newOption;
  };

  const handleAdd = async () => {
    if (kind === "manual") {
      if (!description.trim()) {
        setError("Keterangan wajib diisi");
        return;
      }
    } else if (!itemId) {
      setError("Pilih itemnya dulu");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Jumlah biaya wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/payments/${paymentId}/costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "manual" ? { kind, description, categoryId: categoryId || undefined, amount } : { kind, itemId, amount }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menambah biaya");
      return;
    }
    setAdding(false);
    router.refresh();
  };

  if (costTransactions.length === 0 && !canEdit) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-500 uppercase">Biaya</p>
        {canEdit && !adding && (
          <Button size="sm" variant="ghost" onClick={openAdd} leftIcon={<Plus className="w-3.5 h-3.5" />}>
            Tambah Baris
          </Button>
        )}
      </div>

      {costTransactions.length > 0 && (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keterangan</TableHead>
                <TableHead>Akun</TableHead>
                <TableHead>Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costTransactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.description}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <EditableCostAccount paymentId={paymentId} transactionId={t.id} accountId={t.accountId} accountName={t.account.name} />
                    ) : (
                      t.account.name
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {canEdit ? <EditableCostAmount paymentId={paymentId} transactionId={t.id} amount={t.grossAmount} /> : formatRupiah(t.grossAmount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {adding && (
        <div className="mt-3 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-3">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Select
            label="Tipe"
            sizeVariant="sm"
            options={KIND_OPTIONS}
            value={kind}
            onChange={(v) => {
              setKind(v as Kind);
              setItemId("");
            }}
            searchable={false}
          />
          {kind === "manual" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="Keterangan" sizeVariant="sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Biaya admin" />
              <Select
                label="Akun Biaya"
                sizeVariant="sm"
                options={categoryOptions}
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Pilih atau tambah akun biaya"
                searchPlaceholder="Cari atau ketik untuk tambah..."
                emptyText="Belum ada, ketik untuk menambah"
                creatable
                onCreateOption={handleCreateCategory}
                createOptionLabel={(q) => `Tambah "${q}"`}
              />
              <CurrencyInput label="Nominal" sizeVariant="sm" value={amount} onChange={setAmount} placeholder="mis. 50.000" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select
                label={kind === "domain" ? "Domain" : kind === "server" ? "Server" : "Maintenance"}
                sizeVariant="sm"
                options={itemOptions}
                value={itemId}
                onChange={setItemId}
                placeholder="Pilih item"
                emptyText="Tidak ada — pastikan sudah punya harga di Master Data"
              />
              <CurrencyInput label="Biaya (HPP)" sizeVariant="sm" value={amount} onChange={setAmount} placeholder="mis. 300.000" />
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Batal
            </Button>
            <Button size="sm" variant="primary" onClick={handleAdd} isLoading={saving}>
              Simpan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
