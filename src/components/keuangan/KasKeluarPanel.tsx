"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
  Alert,
  CurrencyInput,
  FilterableTable,
  Modal,
  type FilterableColumn,
} from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AccountOption } from "./AccountPicker";
import { ChevronLeft, Plus, Pencil } from "lucide-react";
import { type BillItemOption, formatRupiah } from "./kasKeluarShared";

interface TransactionRow {
  id: string;
  transactionNumber: string | null;
  grossAmount: number;
  description: string | null;
  occurredAt: string;
  postStatus: "draft" | "posted" | "voided";
  refType: string | null;
  refId: string | null;
  paymentId: string | null;
  journalEntryId: string | null;
  accountId: string;
  categoryId: string | null;
  account: { name: string };
  category: { name: string } | null;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Kas Keluar — satu pintu buat semua pengeluaran kas/bank, termasuk yang dulu dua menu
 *  terpisah "Bayar Domain"/"Bayar Server" (sekarang jadi salah satu Tipe baris di form).
 *  Riwayat ditaruh di ATAS (paling sering dilihat/dicek ulang) — input-nya di halaman
 *  terpisah (/kas-keluar/baru), supaya list-nya tidak ke-geser jauh ke bawah tiap kali form
 *  diisi banyak baris. (Sempat dicoba juga versi modal untuk dibandingkan — hasilnya halaman
 *  terpisah yang dipakai, lihat KasKeluarForm.tsx/KasKeluarNewPagePanel.tsx.)
 *  domains/servers/maintenances/recurringBills di sini CUMA buat resolve nama di kolom
 *  Keterangan Riwayat (baris refType domain/server/dst) — bukan buat form lagi. */
export const KasKeluarPanel: React.FC<{
  accounts: AccountOption[];
  domains: BillItemOption[];
  servers: BillItemOption[];
  maintenances: BillItemOption[];
  recurringBills: BillItemOption[];
}> = ({ accounts, domains, servers, maintenances, recurringBills }) => {
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [error, setError] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);

  // Edit draft pengeluaran manual langsung dari tabel riwayat — sama syaratnya dengan PATCH
  // /api/transactions/[id] (draft, tanpa refType Bayar Domain/dst, bukan bagian dari Payment).
  const [editingRow, setEditingRow] = useState<TransactionRow | null>(null);
  const [editForm, setEditForm] = useState({ description: "", accountId: "", categoryId: "", grossAmount: 0 });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const openEdit = (row: TransactionRow) => {
    setEditingRow(row);
    setEditForm({ description: row.description ?? "", accountId: row.accountId, categoryId: row.categoryId ?? "", grossAmount: row.grossAmount });
    setEditError("");
  };

  const handleEditSave = async () => {
    if (!editingRow) return;
    if (!editForm.accountId) {
      setEditError("Akun kas/bank wajib dipilih");
      return;
    }
    if (!editForm.grossAmount || editForm.grossAmount <= 0) {
      setEditError("Nominal tidak valid");
      return;
    }
    setEditSaving(true);
    setEditError("");
    const res = await fetch(`/api/transactions/${editingRow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const data = await res.json().catch(() => null);
    setEditSaving(false);
    if (!res.ok) {
      setEditError(data?.error || "Gagal menyimpan perubahan");
      return;
    }
    setEditingRow(null);
    window.dispatchEvent(new Event("transactions-changed"));
    load();
  };

  const load = () => {
    fetch(`/api/transactions?type=expense`)
      .then((r) => r.json())
      .then((data: TransactionRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError("Gagal memuat riwayat"));
  };

  useEffect(() => {
    load();
    window.addEventListener("transactions-changed", load);
    return () => window.removeEventListener("transactions-changed", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`/api/categories?kind=expense`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setCategoryOptions(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))))
      .catch(() => {});
  }, []);

  const nameByRefId = new Map<string, string>();
  for (const d of domains) nameByRefId.set(d.id, d.name);
  for (const s of servers) nameByRefId.set(s.id, s.name);
  for (const m of maintenances) nameByRefId.set(m.id, m.name);
  for (const b of recurringBills) nameByRefId.set(b.id, b.name);

  const REF_LABEL: Record<string, string> = {
    domain: "Bayar Domain",
    server: "Bayar Server",
    maintenance: "Bayar Maintenance",
    recurring_bill: "Bayar Biaya Berkala",
    kasbon: "Kasbon",
  };

  const rowLabel = (r: TransactionRow) => {
    if (r.refType && r.refId) return `${REF_LABEL[r.refType] ?? r.refType} — ${nameByRefId.get(r.refId) ?? "-"}`;
    return r.description || r.category?.name || "-";
  };

  const columns: FilterableColumn<TransactionRow>[] = [
    {
      key: "transactionNumber",
      header: "No. Bukti",
      filterValue: (r) => r.transactionNumber ?? "",
      cellClassName: "font-semibold",
      cell: (r) => (
        <Link href={`/keuangan/transaksi/${r.id}`} className="hover:underline">
          {r.transactionNumber ?? "-"}
        </Link>
      ),
    },
    { key: "occurredAt", header: "Tanggal", cell: (r) => formatDate(r.occurredAt) },
    { key: "description", header: "Keterangan", cellClassName: "font-semibold", filterValue: rowLabel, cell: rowLabel },
    { key: "account", header: "Akun", cell: (r) => r.account.name },
    { key: "amount", header: "Jumlah", cellClassName: "font-semibold", cell: (r) => formatRupiah(r.grossAmount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={r.postStatus} size="sm" /> },
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) =>
        r.postStatus === "draft" && !r.refType && !r.paymentId ? (
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)} leftIcon={<Pencil className="w-3.5 h-3.5" />}>
            Edit
          </Button>
        ) : (
          <span className="text-xs text-slate-400">-</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/keuangan" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
            <ChevronLeft className="w-3.5 h-3.5" />
            Keuangan
          </Link>
          <div className="mt-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Kas Keluar</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Catat pengeluaran kas/bank — biaya manual maupun Bayar Domain/Server/Biaya Berkala, boleh lebih dari 1 baris sekaligus.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/keuangan/kas-keluar/baru">
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
              Tambah Kas Keluar
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6">
          <CardTitle>Riwayat Kas Keluar</CardTitle>
          <CardDescription>{rows?.length ?? 0} transaksi</CardDescription>
        </div>
        <FilterableTable columns={columns} rows={rows ?? []} rowKey={(r) => r.id} pageSize={20} emptyMessage="Belum ada pengeluaran." mobileCardMode />
      </Card>

      <Modal
        isOpen={editingRow !== null}
        onClose={() => setEditingRow(null)}
        title="Edit Kas Keluar"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingRow(null)}>
              Batal
            </Button>
            <Button onClick={handleEditSave} isLoading={editSaving}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {editError && <Alert variant="error">{editError}</Alert>}
          <Input label="Keterangan" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Akun"
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={editForm.accountId}
              onChange={(v) => setEditForm((f) => ({ ...f, accountId: v }))}
            />
            <Select
              label="Kategori Biaya"
              options={categoryOptions}
              value={editForm.categoryId}
              onChange={(v) => setEditForm((f) => ({ ...f, categoryId: v }))}
              placeholder="Tanpa kategori"
            />
          </div>
          <CurrencyInput label="Nominal" value={editForm.grossAmount} onChange={(v) => setEditForm((f) => ({ ...f, grossAmount: v }))} />
        </div>
      </Modal>
    </div>
  );
};
