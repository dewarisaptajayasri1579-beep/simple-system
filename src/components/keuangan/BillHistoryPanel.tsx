"use client";

import { useEffect, useMemo, useState } from "react";
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
import { jakartaTodayDateIso } from "@/lib/datetime";

export interface BillItemOption {
  id: string;
  name: string;
  price: number | null;
  clientName: string | null;
}

interface TransactionRow {
  id: string;
  grossAmount: number;
  occurredAt: string;
  postStatus: "draft" | "posted" | "voided";
  refId: string | null;
  journalEntryId: string | null;
  account: { name: string };
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Riwayat + form "Tandai Lunas" untuk Bayar Domain/Server — dua kartu di Keuangan yang
 *  sekarang navigasi ke halaman sendiri (bukan modal di tempat), supaya histori pembayaran
 *  per item langsung kelihatan, bukan cuma keluar-masuk kartu saldo. */
export const BillHistoryPanel: React.FC<{
  kind: "domain" | "server";
  title: string;
  itemLabel: string;
  items: BillItemOption[];
  accounts: AccountOption[];
  isOwner: boolean;
}> = ({ kind, title, itemLabel, items, accounts: initialAccounts, isOwner }) => {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [isOpen, setIsOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [paidAt, setPaidAt] = useState(jakartaTodayDateIso());
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch(`/api/transactions?refType=${kind}`)
      .then((r) => r.json())
      .then((data: TransactionRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError("Gagal memuat riwayat"));
  };

  useEffect(() => {
    load();
    window.addEventListener("transactions-changed", load);
    return () => window.removeEventListener("transactions-changed", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const itemOptions = useMemo(
    () => items.map((i) => ({ value: i.id, label: `${i.name}${i.clientName ? ` — ${i.clientName}` : ""} · ${formatRupiah(i.price ?? 0)}` })),
    [items]
  );

  const itemNameById = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  const openModal = () => {
    setItemId("");
    setAccountId(accounts[0]?.id ?? "");
    setAmount(0);
    setPaidAt(jakartaTodayDateIso());
    setError("");
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!itemId) {
      setError(`Pilih ${itemLabel.toLowerCase()} dulu`);
      return;
    }
    if (!accountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Nominal wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/${kind === "domain" ? "domains" : "servers"}/${itemId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, amount, paidAt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menandai lunas");
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
    { key: "item", header: itemLabel, cellClassName: "font-semibold", cell: (r) => (r.refId && itemNameById.get(r.refId)) ?? "-" },
    { key: "account", header: "Akun", cell: (r) => r.account.name },
    { key: "amount", header: "Nominal", cellClassName: "font-semibold", cell: (r) => formatRupiah(r.grossAmount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={r.postStatus} size="sm" /> },
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <JournalButton
            title="Jurnal Pembayaran"
            sources={[r.journalEntryId ? { entryId: r.journalEntryId } : { sourceType: kind, sourceId: r.refId ?? r.id }]}
            postUrl={r.postStatus === "draft" ? `/api/transactions/${r.id}/post` : undefined}
          />
          {r.postStatus === "draft" && (
            <Button size="sm" variant="primary" onClick={() => handlePost(r.id)} isLoading={busy === r.id}>
              Posting
            </Button>
          )}
          {r.postStatus === "posted" && isOwner && (
            <VoidButton
              voidUrl={`/api/transactions/${r.id}/void`}
              itemLabel={`pembayaran ${(r.refId && itemNameById.get(r.refId)) ?? itemLabel}`}
              onVoided={load}
            />
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
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Riwayat pembayaran {itemLabel.toLowerCase()} — tandai lunas yang baru di sini.</p>
          </div>
          {isOwner && <Button variant="primary" onClick={openModal}>{title}</Button>}
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6">
          <CardTitle>Riwayat Pembayaran</CardTitle>
          <CardDescription>{rows?.length ?? 0} transaksi</CardDescription>
        </div>
        <FilterableTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(r) => r.id}
          pageSize={20}
          emptyMessage={`Belum ada pembayaran ${itemLabel.toLowerCase()}.`}
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
          <Select
            label={itemLabel}
            options={itemOptions}
            value={itemId}
            onChange={(v) => {
              setItemId(v);
              setAmount(0);
            }}
            placeholder={`Pilih ${itemLabel.toLowerCase()}`}
            emptyText="Tidak ada — pastikan sudah punya harga di Master Data"
          />
          <AccountPicker
            label="Bayar dari Akun"
            accounts={accounts}
            value={accountId}
            onChange={setAccountId}
            onAccountCreated={(a) => setAccounts((prev) => [...prev, a])}
          />
          <CurrencyInput label="Biaya (HPP) — bukan harga jual" value={amount} onChange={setAmount} placeholder="mis. 300.000" />
          <Input label="Tanggal" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              Tandai Lunas
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
