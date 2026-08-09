"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { JournalButton } from "@/components/akuntansi/JournalButton";
import { VoidButton } from "@/components/akuntansi/VoidButton";
import { AccountPicker, type AccountOption } from "./AccountPicker";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { guessCategoryId } from "@/lib/category-guess";
import { jakartaTodayDateIso } from "@/lib/datetime";

export interface BillItemOption {
  id: string;
  name: string;
  price: number | null;
  clientName: string | null;
}

type LineKind = "manual" | "domain" | "server" | "maintenance" | "recurring_bill";

interface LineDraft {
  kind: LineKind;
  categoryId: string;
  description: string;
  domainId: string;
  serverId: string;
  maintenanceId: string;
  recurringBillId: string;
  amount: number;
}

const emptyLine = (): LineDraft => ({
  kind: "manual",
  categoryId: "",
  description: "",
  domainId: "",
  serverId: "",
  maintenanceId: "",
  recurringBillId: "",
  amount: 0,
});

interface TransactionRow {
  id: string;
  grossAmount: number;
  description: string | null;
  occurredAt: string;
  postStatus: "draft" | "posted" | "voided";
  refType: string | null;
  refId: string | null;
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

const KIND_OPTIONS = [
  { value: "manual", label: "Biaya Manual" },
  { value: "domain", label: "Bayar Domain" },
  { value: "server", label: "Bayar Server" },
  { value: "maintenance", label: "Bayar Maintenance" },
  { value: "recurring_bill", label: "Bayar Biaya Berkala" },
];

/** Kas Keluar — satu pintu buat semua pengeluaran kas/bank, termasuk yang dulu dua menu
 *  terpisah "Bayar Domain"/"Bayar Server" (sekarang jadi salah satu Tipe baris di sini).
 *  Bukan modal — form input langsung di halaman ini, bisa lebih dari 1 baris biaya sekaligus
 *  dalam satu input (mis. bayar listrik + bayar domain sekaligus dari kas yang sama). */
export const KasKeluarPanel: React.FC<{
  accounts: AccountOption[];
  domains: BillItemOption[];
  servers: BillItemOption[];
  maintenances: BillItemOption[];
  recurringBills: BillItemOption[];
  isOwner: boolean;
}> = ({ accounts: initialAccounts, domains, servers, maintenances, recurringBills, isOwner }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(jakartaTodayDateIso());
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Modal "Tambah Kategori Biaya" — sekalian minta pilih COA Beban-nya, bukan cuma nama, biar
  // kategori baru langsung ke-mapping (default-nya jatuh ke "Beban Lain-lain" kalau dilewatkan).
  const [coaAccountList, setCoaAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [newCategoryLineIndex, setNewCategoryLineIndex] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCoaId, setNewCategoryCoaId] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState("");

  useEffect(() => {
    fetch("/api/coa")
      .then((r) => r.json())
      .then((data: { id: string; code: string; name: string; type: string; isParent: boolean }[]) => {
        if (!Array.isArray(data)) return;
        setCoaAccounts(data.filter((a) => a.type === "expense" && !a.isParent));
      })
      .catch(() => {});
  }, []);
  const coaOptions = useMemo(() => coaAccountList.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })), [coaAccountList]);

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

  const domainOptions = useMemo(
    () => domains.map((d) => ({ value: d.id, label: `${d.name}${d.clientName ? ` — ${d.clientName}` : ""} · ${formatRupiah(d.price ?? 0)}` })),
    [domains]
  );
  const serverOptions = useMemo(() => servers.map((s) => ({ value: s.id, label: `${s.name} · ${formatRupiah(s.price ?? 0)}` })), [servers]);
  const maintenanceOptions = useMemo(
    () => maintenances.map((m) => ({ value: m.id, label: `${m.name}${m.clientName ? ` — ${m.clientName}` : ""} · ${formatRupiah(m.price ?? 0)}` })),
    [maintenances]
  );
  const recurringBillOptions = useMemo(
    () => recurringBills.map((b) => ({ value: b.id, label: `${b.name} · ${formatRupiah(b.price ?? 0)}` })),
    [recurringBills]
  );
  const nameByRefId = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of domains) map.set(d.id, d.name);
    for (const s of servers) map.set(s.id, s.name);
    for (const m of maintenances) map.set(m.id, m.name);
    for (const b of recurringBills) map.set(b.id, b.name);
    return map;
  }, [domains, servers, maintenances, recurringBills]);

  const kindOptions = isOwner ? KIND_OPTIONS : KIND_OPTIONS.filter((o) => o.value === "manual");

  // Datang dari "Bayar Sekarang" biaya berkala di Dashboard (?recurringBillId=...) — langsung
  // isi baris pertama supaya user tinggal pilih akun kas/bank & simpan, bukan input ulang.
  useEffect(() => {
    const billId = searchParams.get("recurringBillId");
    if (!billId) return;
    const bill = recurringBills.find((b) => b.id === billId);
    if (!bill) return;
    setLines([{ ...emptyLine(), kind: "recurring_bill", recurringBillId: bill.id, amount: bill.price ?? 0 }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const openNewCategoryModal = (lineIndex: number, name: string) => {
    setNewCategoryLineIndex(lineIndex);
    setNewCategoryName(name);
    setNewCategoryCoaId("");
    setCategoryError("");
  };

  const handleConfirmNewCategory = async () => {
    if (!newCategoryName.trim()) {
      setCategoryError("Nama kategori wajib diisi");
      return;
    }
    setSavingCategory(true);
    setCategoryError("");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategoryName.trim(), kind: "expense", coaAccountId: newCategoryCoaId || undefined }),
    });
    const cat = await res.json().catch(() => null);
    setSavingCategory(false);
    if (!res.ok || !cat?.id) {
      setCategoryError(cat?.error || "Gagal menambah kategori");
      return;
    }
    const newOption = { value: cat.id as string, label: cat.name as string };
    setCategoryOptions((prev) => (prev.some((o) => o.value === newOption.value) ? prev : [...prev, newOption].sort((a, b) => a.label.localeCompare(b.label))));
    if (newCategoryLineIndex !== null) updateLine(newCategoryLineIndex, { categoryId: newOption.value });
    setNewCategoryLineIndex(null);
  };

  const totalAmount = lines.reduce((sum, l) => sum + (l.amount || 0), 0);

  const resetForm = () => {
    setAccountId(accounts[0]?.id ?? "");
    setOccurredAt(jakartaTodayDateIso());
    setLines([emptyLine()]);
  };

  const handleSave = async () => {
    if (!accountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    const missingAmount = lines.find((l) => !l.amount || l.amount <= 0);
    if (missingAmount) {
      setError("Semua baris wajib diisi nominalnya");
      return;
    }
    const missingLink = lines.find(
      (l) =>
        (l.kind === "domain" && !l.domainId) ||
        (l.kind === "server" && !l.serverId) ||
        (l.kind === "maintenance" && !l.maintenanceId) ||
        (l.kind === "recurring_bill" && !l.recurringBillId)
    );
    if (missingLink) {
      setError("Ada baris Bayar Domain/Server/Maintenance/Biaya Berkala yang belum pilih itemnya");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/transactions/kas-keluar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          occurredAt,
          lines: lines.map((l) => ({
            kind: l.kind,
            categoryId: l.kind === "manual" ? l.categoryId || undefined : undefined,
            description: l.kind === "manual" ? l.description : undefined,
            domainId: l.kind === "domain" ? l.domainId : undefined,
            serverId: l.kind === "server" ? l.serverId : undefined,
            maintenanceId: l.kind === "maintenance" ? l.maintenanceId : undefined,
            recurringBillId: l.kind === "recurring_bill" ? l.recurringBillId : undefined,
            amount: l.amount,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan Kas Keluar");
        setSaving(false);
        return;
      }
      resetForm();
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

  const REF_LABEL: Record<string, string> = {
    domain: "Bayar Domain",
    server: "Bayar Server",
    maintenance: "Bayar Maintenance",
    recurring_bill: "Bayar Biaya Berkala",
  };

  const rowLabel = (r: TransactionRow) => {
    if (r.refType && r.refId) return `${REF_LABEL[r.refType] ?? r.refType} — ${nameByRefId.get(r.refId) ?? "-"}`;
    return r.description || r.category?.name || "-";
  };

  const columns: FilterableColumn<TransactionRow>[] = [
    { key: "occurredAt", header: "Tanggal", cell: (r) => formatDate(r.occurredAt) },
    { key: "description", header: "Keterangan", cellClassName: "font-semibold", filterValue: rowLabel, cell: rowLabel },
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
            sources={[r.journalEntryId ? { entryId: r.journalEntryId } : { sourceType: r.refType ?? "transaction", sourceId: r.refId ?? r.id }]}
            postUrl={r.postStatus === "draft" ? `/api/transactions/${r.id}/post` : undefined}
          />
          {r.postStatus === "draft" && (
            <Button size="sm" variant="primary" onClick={() => handlePost(r.id)} isLoading={busy === r.id}>
              Posting
            </Button>
          )}
          {r.postStatus === "posted" && isOwner && (
            <VoidButton voidUrl={`/api/transactions/${r.id}/void`} itemLabel={rowLabel(r)} onVoided={load} />
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
        <div className="mt-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Kas Keluar</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Catat pengeluaran kas/bank — biaya manual maupun Bayar Domain/Server/Biaya Berkala, boleh lebih dari 1 baris sekaligus.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="lg">
        <CardTitle>Input Kas Keluar</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} onAccountCreated={(a) => setAccounts((prev) => [...prev, a])} />
          <Input label="Tanggal" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>

        <div className="mt-6 space-y-4">
          {lines.map((line, i) => (
            <div key={i} className="rounded-xl border border-slate-200/80 p-4 space-y-3 bg-slate-50/50">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <Select
                    label="Tipe"
                    sizeVariant="sm"
                    options={kindOptions}
                    value={line.kind}
                    onChange={(v) =>
                      updateLine(i, {
                        kind: v as LineKind,
                        categoryId: "",
                        description: "",
                        domainId: "",
                        serverId: "",
                        maintenanceId: "",
                        recurringBillId: "",
                      })
                    }
                    searchable={false}
                  />
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="mt-6 text-slate-400 hover:text-rose-600 cursor-pointer flex-shrink-0"
                    title="Hapus baris"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {line.kind === "manual" && (
                <>
                  <Select
                    label="Kategori Biaya (opsional)"
                    sizeVariant="sm"
                    options={categoryOptions}
                    value={line.categoryId}
                    onChange={(v) => updateLine(i, { categoryId: v })}
                    placeholder="Pilih atau tambah biaya"
                    searchPlaceholder="Cari atau ketik untuk tambah..."
                    emptyText="Belum ada, ketik untuk menambah"
                    creatable
                    deferCreate
                    onCreateOption={(q) => openNewCategoryModal(i, q)}
                    createOptionLabel={(q) => `Tambah "${q}"`}
                  />
                  <Input
                    label="Keterangan"
                    sizeVariant="sm"
                    value={line.description}
                    onChange={(e) => {
                      const description = e.target.value;
                      const guess = !line.categoryId ? guessCategoryId(description, categoryOptions) : null;
                      updateLine(i, guess ? { description, categoryId: guess } : { description });
                    }}
                    placeholder="mis. bayar listrik kantor"
                  />
                </>
              )}
              {line.kind === "domain" && (
                <Select
                  label="Domain"
                  sizeVariant="sm"
                  options={domainOptions}
                  value={line.domainId}
                  onChange={(v) => updateLine(i, { domainId: v })}
                  placeholder="Pilih domain"
                  emptyText="Tidak ada — pastikan sudah punya harga di Master Data"
                />
              )}
              {line.kind === "server" && (
                <Select
                  label="Server"
                  sizeVariant="sm"
                  options={serverOptions}
                  value={line.serverId}
                  onChange={(v) => updateLine(i, { serverId: v })}
                  placeholder="Pilih server"
                  emptyText="Tidak ada — pastikan sudah punya harga di Master Data"
                />
              )}
              {line.kind === "maintenance" && (
                <Select
                  label="Maintenance"
                  sizeVariant="sm"
                  options={maintenanceOptions}
                  value={line.maintenanceId}
                  onChange={(v) => updateLine(i, { maintenanceId: v })}
                  placeholder="Pilih maintenance"
                  emptyText="Tidak ada — pastikan sudah punya harga di Master Data"
                />
              )}
              {line.kind === "recurring_bill" && (
                <Select
                  label="Biaya Berkala"
                  sizeVariant="sm"
                  options={recurringBillOptions}
                  value={line.recurringBillId}
                  onChange={(v) => updateLine(i, { recurringBillId: v })}
                  placeholder="Pilih biaya berkala"
                  emptyText="Tidak ada — pastikan sudah aktif & punya nominal di Master Data"
                />
              )}
              <CurrencyInput
                label={line.kind === "manual" ? "Jumlah" : "Biaya (HPP) — bukan harga jual"}
                sizeVariant="sm"
                value={line.amount}
                onChange={(v) => updateLine(i, { amount: v })}
              />
            </div>
          ))}

          <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            Tambah Baris
          </Button>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200/60">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Total</p>
            <p className="text-lg font-black text-slate-900">{formatRupiah(totalAmount)}</p>
          </div>
          <Button variant="primary" onClick={handleSave} isLoading={saving}>
            Simpan Kas Keluar
          </Button>
        </div>
      </Card>

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6">
          <CardTitle>Riwayat Kas Keluar</CardTitle>
          <CardDescription>{rows?.length ?? 0} transaksi</CardDescription>
        </div>
        <FilterableTable columns={columns} rows={rows ?? []} rowKey={(r) => r.id} pageSize={20} emptyMessage="Belum ada pengeluaran." mobileCardMode />
      </Card>

      <Modal
        isOpen={newCategoryLineIndex !== null}
        onClose={() => setNewCategoryLineIndex(null)}
        title="Tambah Kategori Biaya"
        subtitle="Kategori baru langsung dipetakan ke akun COA Beban-nya, supaya jurnalnya benar sejak awal."
        footer={
          <>
            <Button variant="outline" onClick={() => setNewCategoryLineIndex(null)}>
              Batal
            </Button>
            <Button onClick={handleConfirmNewCategory} isLoading={savingCategory}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {categoryError && <Alert variant="error">{categoryError}</Alert>}
          <Input label="Nama Kategori" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="mis. Listrik Kantor" />
          <Select
            label="COA Beban (opsional)"
            options={coaOptions}
            value={newCategoryCoaId}
            onChange={setNewCategoryCoaId}
            placeholder="Pilih akun Beban — kosongkan untuk pakai Beban Lain-lain"
          />
        </div>
      </Modal>
    </div>
  );
};
