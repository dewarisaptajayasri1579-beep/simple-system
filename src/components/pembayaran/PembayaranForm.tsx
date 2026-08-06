"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Select,
  Input,
  Alert,
  FilterableTable,
  CurrencyInput,
  type FilterableColumn,
} from "@/components/ui";

export interface ClientOption {
  id: string;
  name: string;
}

interface AccountOption {
  id: string;
  name: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  dueDate: string | null;
  remaining: number;
}

interface LineState {
  checked: boolean;
  amount: number;
  costAmount: number;
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export const PembayaranForm: React.FC<{ clients: ClientOption[]; prefillClientId?: string; prefillInvoiceId?: string }> = ({
  clients,
  prefillClientId,
  prefillInvoiceId,
}) => {
  const router = useRouter();
  const [clientId, setClientId] = useState(prefillClientId ?? "");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: AccountOption[]) => {
        setAccounts(data);
        setAccountId((prev) => prev || data[0]?.id || "");
      });
  }, []);

  useEffect(() => {
    if (!clientId) {
      setInvoices([]);
      setLines({});
      return;
    }
    setIsLoadingInvoices(true);
    fetch(`/api/invoices?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data: Array<{ id: string; invoiceNumber: string; totalAmount: number; dueDate: string | null; payments: { amount: number }[] }>) => {
        const rows: InvoiceRow[] = data
          .map((inv) => {
            const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
            return {
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              totalAmount: inv.totalAmount,
              dueDate: inv.dueDate,
              remaining: Math.max(0, inv.totalAmount - paid),
            };
          })
          .filter((r) => r.remaining > 0.5);
        setInvoices(rows);
        setLines(Object.fromEntries(rows.map((r) => [r.id, { checked: r.id === prefillInvoiceId, amount: r.remaining, costAmount: 0 }])));
      })
      .finally(() => setIsLoadingInvoices(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const clientOptions = useMemo(() => clients.map((c) => ({ value: c.id, label: c.name })), [clients]);
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);

  const updateLine = (id: string, patch: Partial<LineState>) =>
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const totalDibayar = Object.values(lines).reduce((sum, l) => sum + (l.checked ? l.amount : 0), 0);

  const columns: FilterableColumn<InvoiceRow>[] = [
    { key: "no", header: "#", cell: (_row, i) => i + 1, headClassName: "w-10", cellClassName: "text-slate-400" },
    {
      key: "check",
      header: "",
      headClassName: "w-10",
      cell: (inv) => (
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={lines[inv.id]?.checked ?? false}
          onChange={(e) => updateLine(inv.id, { checked: e.target.checked })}
        />
      ),
    },
    {
      key: "invoiceNumber",
      header: "No. Invoice",
      filterValue: (inv) => inv.invoiceNumber,
      cellClassName: "font-semibold",
      cell: (inv) => (
        <Link href={`/penjualan/${inv.id}`} target="_blank" className="hover:underline">
          {inv.invoiceNumber}
        </Link>
      ),
    },
    { key: "dueDate", header: "Jatuh Tempo", cell: (inv) => formatDate(inv.dueDate) },
    { key: "totalAmount", header: "Total", cell: (inv) => formatRupiah(inv.totalAmount) },
    { key: "remaining", header: "Sisa", cellClassName: "font-semibold", cell: (inv) => formatRupiah(inv.remaining) },
    {
      key: "amount",
      header: "Jumlah Dibayar",
      headClassName: "min-w-[10rem]",
      cell: (inv) => (
        <CurrencyInput
          sizeVariant="sm"
          value={lines[inv.id]?.amount ?? 0}
          disabled={!lines[inv.id]?.checked}
          onChange={(v) => updateLine(inv.id, { amount: v })}
        />
      ),
    },
    {
      key: "cost",
      header: "HPP (opsional)",
      headClassName: "min-w-[10rem]",
      cell: (inv) => (
        <CurrencyInput
          sizeVariant="sm"
          value={lines[inv.id]?.costAmount ?? 0}
          disabled={!lines[inv.id]?.checked}
          onChange={(v) => updateLine(inv.id, { costAmount: v })}
        />
      ),
    },
  ];

  const handleClientChange = (value: string) => {
    setClientId(value);
    router.replace(value ? `/pembayaran?clientId=${value}` : "/pembayaran");
  };

  const handleSubmit = async () => {
    setError("");
    if (!clientId) {
      setError("Pilih client dulu");
      return;
    }
    if (!accountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    const selected = Object.entries(lines).filter(([, l]) => l.checked && l.amount > 0);
    if (selected.length === 0) {
      setError("Centang minimal 1 invoice & isi jumlah dibayar");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          accountId,
          notes,
          lines: selected.map(([invoiceId, l]) => ({ invoiceId, amount: l.amount, costAmount: l.costAmount })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan pembayaran");
        setIsSubmitting(false);
        return;
      }
      router.push(`/pembayaran/${data.id}`);
    } catch {
      setError("Gagal menghubungi server");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Client" options={clientOptions} value={clientId} onChange={handleClientChange} placeholder="Pilih client" />
          <Select label="Masuk ke Akun" options={accountOptions} value={accountId} onChange={setAccountId} placeholder="Pilih Kas/Bank" />
        </div>
      </Card>

      {clientId && (
        <Card variant="panel" padding="none">
          <div className="p-5 sm:p-6">
            <CardTitle>Invoice Belum Lunas</CardTitle>
            <CardDescription>Centang invoice yang mau dibayar, sesuaikan nominal kalau dicicil sebagian.</CardDescription>
          </div>
          <FilterableTable
            columns={columns}
            rows={invoices}
            rowKey={(inv) => inv.id}
            searchPlaceholder="Cari no. invoice..."
            emptyMessage={isLoadingInvoices ? "Memuat invoice..." : "Semua invoice client ini sudah lunas."}
          />
        </Card>
      )}

      {clientId && invoices.length > 0 && (
        <Card variant="panel" padding="lg">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
            <div className="flex-1">
              <Input label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-bold text-slate-500 uppercase">Total Dibayar</p>
              <p className="text-xl font-black text-emerald-700">{formatRupiah(totalDibayar)}</p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting} disabled={totalDibayar <= 0}>
              Simpan Pembayaran
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
