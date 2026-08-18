"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, Input, Alert, CurrencyInput, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AccountPicker, type AccountOption } from "./AccountPicker";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { jakartaTodayDateIso } from "@/lib/datetime";

interface TransferRow {
  id: string;
  transferNumber: string | null;
  amount: number;
  description: string | null;
  occurredAt: string;
  postStatus: "draft" | "posted" | "voided";
  sourceAccount: { name: string };
  destinationAccount: { name: string };
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Pindah Buku — pemindahan saldo antar akun kas/bank sendiri (mis. tarik tunai ATM, setor
 *  tunai) — bukan pendapatan/beban. Sama pola halaman dengan Kas Keluar/Masuk: form input
 *  langsung di sini (bukan modal) + riwayat di bawahnya, tiap baris link ke halaman detailnya
 *  sendiri buat Posting/Edit/Hapus. */
export const PindahBukuPanel: React.FC<{ accounts: AccountOption[] }> = ({ accounts: initialAccounts }) => {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [rows, setRows] = useState<TransferRow[] | null>(null);
  const [error, setError] = useState("");

  const [sourceAccountId, setSourceAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [destinationAccountId, setDestinationAccountId] = useState(initialAccounts[1]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(jakartaTodayDateIso());
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch("/api/account-transfers")
      .then((r) => r.json())
      .then((data: TransferRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError("Gagal memuat riwayat"));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    if (!sourceAccountId) {
      setError("Pilih akun sumber dulu");
      return;
    }
    if (!destinationAccountId) {
      setError("Pilih akun tujuan dulu");
      return;
    }
    if (sourceAccountId === destinationAccountId) {
      setError("Akun sumber dan tujuan tidak boleh sama");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Nominal wajib diisi");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAccountId, destinationAccountId, amount, description, occurredAt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan Pindah Buku");
        setSaving(false);
        return;
      }
      router.push(`/keuangan/pindah-buku/${data.id}`);
    } catch {
      setError("Gagal menghubungi server");
      setSaving(false);
    }
  };

  const rowLabel = (r: TransferRow) => r.description || `${r.sourceAccount.name} → ${r.destinationAccount.name}`;

  const columns: FilterableColumn<TransferRow>[] = [
    {
      key: "transferNumber",
      header: "No. Bukti",
      filterValue: (r) => r.transferNumber ?? "",
      cellClassName: "font-semibold",
      cell: (r) => (
        <Link href={`/keuangan/pindah-buku/${r.id}`} className="hover:underline">
          {r.transferNumber ?? "-"}
        </Link>
      ),
    },
    { key: "occurredAt", header: "Tanggal", cell: (r) => formatDate(r.occurredAt) },
    { key: "route", header: "Dari → Ke", filterValue: (r) => `${r.sourceAccount.name} ${r.destinationAccount.name}`, cell: (r) => `${r.sourceAccount.name} → ${r.destinationAccount.name}` },
    { key: "description", header: "Keterangan", cellClassName: "font-semibold", filterValue: rowLabel, cell: (r) => r.description || "-" },
    { key: "amount", header: "Nominal", cellClassName: "font-semibold", cell: (r) => formatRupiah(r.amount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={r.postStatus} size="sm" /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/keuangan" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-3.5 h-3.5" />
          Keuangan
        </Link>
        <div className="mt-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Pindah Buku</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Pindahkan saldo antar akun kas/bank sendiri — mis. tarik tunai ATM (Bank → Kas) atau setor tunai (Kas → Bank).
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="lg">
        <CardTitle>Input Pindah Buku</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-end gap-3 mt-4">
          <AccountPicker
            label="Dari Akun"
            accounts={accounts}
            value={sourceAccountId}
            onChange={setSourceAccountId}
            onAccountCreated={(a) => setAccounts((prev) => [...prev, a])}
          />
          <ArrowRight className="w-5 h-5 text-slate-400 mb-3 mx-auto hidden sm:block" />
          <AccountPicker
            label="Ke Akun"
            accounts={accounts}
            value={destinationAccountId}
            onChange={setDestinationAccountId}
            onAccountCreated={(a) => setAccounts((prev) => [...prev, a])}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <CurrencyInput label="Nominal" value={amount} onChange={setAmount} />
          <Input label="Tanggal" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        <div className="mt-4">
          <Input label="Keterangan (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. tarik tunai ATM" />
        </div>

        <div className="flex items-center justify-end mt-6 pt-4 border-t border-slate-200/60">
          <Button variant="primary" onClick={handleSave} isLoading={saving}>
            Simpan Pindah Buku
          </Button>
        </div>
      </Card>

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6">
          <CardTitle>Riwayat Pindah Buku</CardTitle>
          <CardDescription>{rows?.length ?? 0} transaksi</CardDescription>
        </div>
        <FilterableTable columns={columns} rows={rows ?? []} rowKey={(r) => r.id} pageSize={20} emptyMessage="Belum ada Pindah Buku." mobileCardMode />
      </Card>
    </div>
  );
};
