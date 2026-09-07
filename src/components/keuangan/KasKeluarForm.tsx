"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Select, Alert, CurrencyInput, Modal } from "@/components/ui";
import { AccountPicker, type AccountOption } from "./AccountPicker";
import { Plus, Trash2 } from "lucide-react";
import { guessCategoryId } from "@/lib/category-guess";
import { jakartaTodayDateIso } from "@/lib/datetime";
import { type BillItemOption, type LineDraft, type LineKind, emptyLine, formatRupiah, KIND_OPTIONS } from "./kasKeluarShared";

/** Form input Kas Keluar murni (tanpa chrome halaman/Card pembungkus) — dipakai baik dari modal
 *  (KasKeluarPanel) maupun halaman penuh (/keuangan/kas-keluar/baru), supaya kedua opsi layout
 *  itu reuse logic & validasi yang sama persis, bukan 2 salinan kode terpisah. */
export const KasKeluarForm: React.FC<{
  accounts: AccountOption[];
  domains: BillItemOption[];
  servers: BillItemOption[];
  maintenances: BillItemOption[];
  recurringBills: BillItemOption[];
  isOwner: boolean;
  onSaved: (transactionIds: string[]) => void;
  /** Kalau diisi, tampil tombol "Batal" di sebelah "Simpan" (dipakai versi modal). */
  onCancel?: () => void;
}> = ({ accounts: initialAccounts, domains, servers, maintenances, recurringBills, isOwner, onSaved, onCancel }) => {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState(initialAccounts);
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

  const kindOptions = isOwner ? KIND_OPTIONS : KIND_OPTIONS.filter((o) => o.value === "manual");

  // Datang dari "Bayar Sekarang" di Dashboard — Domain/Server internal (?domainId=/?serverId=)
  // atau Biaya Berkala (?recurringBillId=) — langsung isi baris pertama supaya user tinggal
  // pilih akun kas/bank & simpan, bukan input ulang.
  useEffect(() => {
    const domainId = searchParams.get("domainId");
    const serverId = searchParams.get("serverId");
    const billId = searchParams.get("recurringBillId");

    if (domainId) {
      const domain = domains.find((d) => d.id === domainId);
      if (domain) setLines([{ ...emptyLine(), kind: "domain", domainId: domain.id, amount: domain.price ?? 0 }]);
      return;
    }
    if (serverId) {
      const server = servers.find((s) => s.id === serverId);
      if (server) setLines([{ ...emptyLine(), kind: "server", serverId: server.id, amount: server.price ?? 0 }]);
      return;
    }
    if (billId) {
      const bill = recurringBills.find((b) => b.id === billId);
      if (bill) setLines([{ ...emptyLine(), kind: "recurring_bill", recurringBillId: bill.id, amount: bill.price ?? 0 }]);
    }
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
      window.dispatchEvent(new Event("transactions-changed"));
      const transactionIds: string[] = Array.isArray(data.transactionIds) ? data.transactionIds : [];
      onSaved(transactionIds);
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} onAccountCreated={(a) => setAccounts((prev) => [...prev, a])} />
          <Input label="Tanggal" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>

        <div className="space-y-4">
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

        <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Total</p>
            <p className="text-lg font-black text-slate-900">{formatRupiah(totalAmount)}</p>
          </div>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Batal
              </Button>
            )}
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              Simpan Kas Keluar
            </Button>
          </div>
        </div>
      </div>

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
    </>
  );
};
