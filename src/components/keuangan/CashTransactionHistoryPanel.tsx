"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Modal,
  Input,
  Select,
  Alert,
  CurrencyInput,
  FilterableTable,
  type FilterableColumn,
} from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JournalButton } from "@/components/akuntansi/JournalButton";
import { VoidButton } from "@/components/akuntansi/VoidButton";
import { AccountPicker, type AccountOption } from "./AccountPicker";
import { ChevronLeft } from "lucide-react";
import { guessCategoryId } from "@/lib/category-guess";
import { jakartaTodayDateIso } from "@/lib/datetime";

interface TransactionRow {
  id: string;
  grossAmount: number;
  description: string | null;
  occurredAt: string;
  postStatus: "draft" | "posted" | "voided";
  refType: string | null;
  journalEntryId: string | null;
  account: { name: string };
  category: { name: string } | null;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Riwayat + form Kas Masuk/Keluar manual — hanya transaksi tanpa refType (bukan pembayaran
 *  domain/server/biaya berkala, itu punya halaman histori sendiri masing-masing). */
export const CashTransactionHistoryPanel: React.FC<{
  type: "income" | "expense";
  title: string;
  accounts: AccountOption[];
  isOwner: boolean;
}> = ({ type, title, accounts: initialAccounts, isOwner }) => {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [isOpen, setIsOpen] = useState(false);
  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [cost, setCost] = useState(0);
  const [occurredAt, setOccurredAt] = useState(jakartaTodayDateIso());
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryAuto, setCategoryAuto] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch(`/api/transactions?type=${type}`)
      .then((r) => r.json())
      .then((data: TransactionRow[]) => setRows(Array.isArray(data) ? data.filter((t) => !t.refType) : []))
      .catch(() => setError("Gagal memuat riwayat"));
  };

  useEffect(() => {
    load();
    window.addEventListener("transactions-changed", load);
    return () => window.removeEventListener("transactions-changed", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/categories?kind=${type}`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setCategoryOptions(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))))
      .catch(() => {});
  }, [isOpen, type]);

  useEffect(() => {
    if (!isOpen) return;
    if (categoryId && !categoryAuto) return;
    const guess = guessCategoryId(description, categoryOptions);
    if (guess) {
      setCategoryId(guess);
      setCategoryAuto(true);
    } else if (categoryAuto) {
      setCategoryId("");
      setCategoryAuto(false);
    }
  }, [description, categoryOptions, isOpen, categoryId, categoryAuto]);

  const openModal = () => {
    setAccountId(accounts[0]?.id ?? "");
    setAmount(0);
    setCost(0);
    setOccurredAt(jakartaTodayDateIso());
    setDescription("");
    setCategoryId("");
    setCategoryAuto(false);
    setError("");
    setIsOpen(true);
  };

  const handleCreateCategory = async (name: string) => {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind: type }),
    });
    const cat = await res.json().catch(() => null);
    if (!res.ok || !cat?.id) return null;
    const newOption = { value: cat.id as string, label: cat.name as string };
    setCategoryOptions((prev) => (prev.some((o) => o.value === newOption.value) ? prev : [...prev, newOption].sort((a, b) => a.label.localeCompare(b.label))));
    return newOption;
  };

  const handleSave = async () => {
    if (!accountId || !amount || amount <= 0) {
      setError("Akun dan jumlah wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          accountId,
          grossAmount: amount,
          cost,
          categoryId: categoryId || null,
          description,
          occurredAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan transaksi");
        setSaving(false);
        return;
      }
      setIsOpen(false);
      load();
      window.dispatchEvent(new Event("transactions-changed"));
      router.refresh();
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id: string) => {
    setBusy(id);
    setError("");
    const res = await fetch(`/api/transactions/${id}/post`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(data?.error || "Gagal posting transaksi");
      return;
    }
    load();
    router.refresh();
  };

  const columns: FilterableColumn<TransactionRow>[] = [
    { key: "occurredAt", header: "Tanggal", cell: (r) => formatDate(r.occurredAt) },
    { key: "description", header: "Keterangan", cellClassName: "font-semibold", cell: (r) => r.description ?? "-" },
    { key: "category", header: type === "income" ? "Pendapatan" : "Biaya", cell: (r) => r.category?.name ?? "-" },
    { key: "account", header: "Akun", cell: (r) => r.account.name },
    { key: "amount", header: "Jumlah", cellClassName: "font-semibold", cell: (r) => formatRupiah(r.grossAmount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={r.postStatus} size="sm" /> },
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <JournalButton
            title="Jurnal Transaksi"
            sources={[r.journalEntryId ? { entryId: r.journalEntryId } : { sourceType: "transaction", sourceId: r.id }]}
            postUrl={r.postStatus === "draft" ? `/api/transactions/${r.id}/post` : undefined}
          />
          {r.postStatus === "draft" && (
            <Button size="sm" variant="primary" onClick={() => handlePost(r.id)} isLoading={busy === r.id}>
              Posting
            </Button>
          )}
          {r.postStatus === "posted" && isOwner && (
            <VoidButton voidUrl={`/api/transactions/${r.id}/void`} itemLabel={r.description ?? "transaksi ini"} onVoided={load} />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/keuangan" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-3.5 h-3.5" />
          Keuangan
        </Link>
        <div className="flex items-start justify-between gap-4 mt-1">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Riwayat {type === "income" ? "pemasukan" : "pengeluaran"} kas/bank manual.
            </p>
          </div>
          <Button variant="primary" onClick={openModal}>{title}</Button>
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6">
          <CardTitle>Riwayat Transaksi</CardTitle>
          <CardDescription>{rows?.length ?? 0} transaksi</CardDescription>
        </div>
        <FilterableTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          pageSize={20}
          emptyMessage={`Belum ada ${type === "income" ? "pemasukan" : "pengeluaran"}.`}
          mobileCardMode
        />
      </Card>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={title}>
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} onAccountCreated={(a) => setAccounts((prev) => [...prev, a])} />
          <CurrencyInput label="Jumlah" value={amount} onChange={setAmount} />
          {type === "income" && <CurrencyInput label="Biaya (dipotong sebelum split, opsional)" value={cost} onChange={setCost} />}
          <Input label="Tanggal" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <Input label="Keterangan (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. bayar listrik kantor" />
          <div>
            <Select
              label={type === "income" ? "Pendapatan (opsional)" : "Biaya (opsional)"}
              options={categoryOptions}
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
                setCategoryAuto(false);
              }}
              placeholder={type === "income" ? "Pilih atau tambah pendapatan" : "Pilih atau tambah biaya"}
              searchPlaceholder="Cari atau ketik untuk tambah..."
              emptyText="Belum ada, ketik untuk menambah"
              creatable
              onCreateOption={handleCreateCategory}
              createOptionLabel={(q) => `Tambah "${q}"`}
            />
            {categoryAuto && categoryId && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 mt-1.5">
                Terdeteksi otomatis dari keterangan — COA ikut otomatis, ganti kalau salah
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
