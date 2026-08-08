"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Modal,
  Input,
  Select,
  CurrencyInput,
  Alert,
  FilterableTable,
  type FilterableColumn,
} from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VoidButton } from "./VoidButton";
import { Plus, Trash2 } from "lucide-react";

export interface JurnalLineRow {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JurnalEntryRow {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  sourceType: string;
  postStatus: "draft" | "posted" | "voided";
  lines: JurnalLineRow[];
}

export interface CoaOption {
  id: string;
  code: string;
  name: string;
}

const SOURCE_LABEL: Record<string, string> = {
  invoice: "Invoice",
  invoice_payment: "Pelunasan",
  transaction: "Transaksi",
  recurring_bill: "Biaya Berkala",
  server: "Server",
  manual: "Manual",
  correction: "Koreksi",
};

const SOURCE_OPTIONS = Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }));

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

interface DraftLine {
  accountId: string;
  debit: number;
  credit: number;
  memo: string;
}

const emptyLine = (): DraftLine => ({ accountId: "", debit: 0, credit: 0, memo: "" });

export const JurnalList: React.FC<{ entries: JurnalEntryRow[]; coaAccounts: CoaOption[]; isOwner: boolean }> = ({
  entries: initialEntries,
  coaAccounts,
  isOwner,
}) => {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [viewing, setViewing] = useState<JurnalEntryRow | null>(null);
  const [posting, setPosting] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const accountOptions = coaAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));

  const totalDebit = draftLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = draftLines.reduce((s, l) => s + l.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.5 && totalDebit > 0;

  const openCreate = () => {
    setIsCreating(true);
    setDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setDraftLines([emptyLine(), emptyLine()]);
    setError("");
  };
  const close = () => setIsCreating(false);

  const updateLine = (index: number, patch: Partial<DraftLine>) => {
    setDraftLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const addLine = () => setDraftLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index: number) => setDraftLines((prev) => (prev.length > 2 ? prev.filter((_, i) => i !== index) : prev));

  const handleSave = async () => {
    if (!description.trim()) {
      setError("Deskripsi wajib diisi");
      return;
    }
    if (!isBalanced) {
      setError("Total debit dan kredit harus sama (dan lebih dari 0)");
      return;
    }
    setIsSaving(true);
    setError("");
    const res = await fetch("/api/journal-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        description,
        lines: draftLines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo || undefined })),
      }),
    });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan jurnal");
      return;
    }
    const newEntry: JurnalEntryRow = {
      id: data.id,
      entryNumber: data.entryNumber,
      date: data.date,
      description: data.description,
      sourceType: data.sourceType,
      postStatus: data.postStatus,
      lines: (data.lines as { id: string; accountId: string; debit: number; credit: number; memo: string | null }[]).map((l) => {
        const acc = coaAccounts.find((a) => a.id === l.accountId);
        return { id: l.id, accountCode: acc?.code ?? "", accountName: acc?.name ?? "", debit: l.debit, credit: l.credit, memo: l.memo };
      }),
    };
    setEntries((prev) => [newEntry, ...prev]);
    close();
    router.refresh();
  };

  const handlePost = async (id: string) => {
    setPosting(id);
    setError("");
    const res = await fetch(`/api/journal-entries/${id}/post`, { method: "POST" });
    const data = await res.json();
    setPosting(null);
    if (!res.ok) {
      setError(data.error || "Gagal posting jurnal");
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, postStatus: "posted" } : e)));
    router.refresh();
  };

  const columns: FilterableColumn<JurnalEntryRow>[] = [
    { key: "entryNumber", header: "No. Jurnal", filterValue: (e) => e.entryNumber, cellClassName: "font-mono font-semibold", cell: (e) => e.entryNumber },
    { key: "date", header: "Tanggal", cell: (e) => formatDate(e.date) },
    { key: "description", header: "Deskripsi", filterValue: (e) => e.description, cell: (e) => e.description },
    {
      key: "sourceType",
      header: "Sumber",
      filterValue: (e) => SOURCE_LABEL[e.sourceType] ?? e.sourceType,
      filterOptions: SOURCE_OPTIONS,
      cell: (e) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border text-slate-600 bg-slate-100 border-slate-300">
          {SOURCE_LABEL[e.sourceType] ?? e.sourceType}
        </span>
      ),
    },
    {
      key: "total",
      header: "Jumlah",
      cellClassName: "font-semibold",
      cell: (e) => formatRupiah(e.lines.reduce((s, l) => s + l.debit, 0)),
    },
    { key: "postStatus", header: "Posting", cell: (e) => <StatusBadge type={e.postStatus} size="sm" /> },
    {
      key: "aksi",
      header: "Aksi",
      cell: (e) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setViewing(e)}>
            Lihat
          </Button>
          {e.postStatus === "draft" && e.sourceType === "manual" && isOwner && (
            <Button size="sm" variant="primary" onClick={() => handlePost(e.id)} isLoading={posting === e.id}>
              Posting
            </Button>
          )}
          {e.postStatus === "posted" && e.sourceType === "manual" && isOwner && (
            <VoidButton
              voidUrl={`/api/journal-entries/${e.id}/void`}
              itemLabel={`jurnal ${e.entryNumber}`}
              onVoided={() => setEntries((prev) => prev.map((row) => (row.id === e.id ? { ...row, postStatus: "voided" } : row)))}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <CardHeader className="p-0 mb-0">
          <CardTitle>Riwayat Jurnal</CardTitle>
          <CardDescription>{entries.length} entry</CardDescription>
        </CardHeader>
        {isOwner && (
          <Button size="sm" variant="outline" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
            Buat Jurnal Manual
          </Button>
        )}
      </div>
      <FilterableTable columns={columns} rows={entries} rowKey={(e) => e.id} pageSize={20} emptyMessage="Belum ada jurnal." />

      <Modal isOpen={viewing !== null} onClose={() => setViewing(null)} title={viewing ? `${viewing.entryNumber} — ${viewing.description}` : ""} size="lg">
        {viewing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-500">{formatDate(viewing.date)} · {SOURCE_LABEL[viewing.sourceType] ?? viewing.sourceType}</p>
              <StatusBadge type={viewing.postStatus} size="sm" />
            </div>
            <div className="rounded-xl border border-slate-200/80 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Akun</th>
                    <th className="text-right px-3 py-2">Debit</th>
                    <th className="text-right px-3 py-2">Kredit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewing.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-slate-500 mr-2">{l.accountCode}</span>
                        {l.accountName}
                      </td>
                      <td className="text-right px-3 py-2 font-semibold">{l.debit > 0 ? formatRupiah(l.debit) : "-"}</td>
                      <td className="text-right px-3 py-2 font-semibold">{l.credit > 0 ? formatRupiah(l.credit) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isCreating} onClose={close} title="Jurnal Manual Baru" size="xl">
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input label="Deskripsi" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Saldo awal Kas & Piutang" />
          </div>

          <div className="space-y-2">
            {draftLines.map((line, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
                <Select
                  label={i === 0 ? "Akun" : undefined}
                  options={accountOptions}
                  value={line.accountId}
                  onChange={(v) => updateLine(i, { accountId: v })}
                  placeholder="Pilih akun"
                  sizeVariant="md"
                />
                <CurrencyInput
                  label={i === 0 ? "Debit" : undefined}
                  value={line.debit}
                  onChange={(v) => updateLine(i, { debit: v, credit: v > 0 ? 0 : line.credit })}
                  sizeVariant="md"
                />
                <CurrencyInput
                  label={i === 0 ? "Kredit" : undefined}
                  value={line.credit}
                  onChange={(v) => updateLine(i, { credit: v, debit: v > 0 ? 0 : line.debit })}
                  sizeVariant="md"
                />
                <Button variant="ghost" size="sm" onClick={() => removeLine(i)} disabled={draftLines.length <= 2}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addLine} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Baris
          </Button>

          <div className={`flex justify-between items-center px-4 py-3 rounded-xl text-sm font-bold ${isBalanced ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            <span>Total Debit: {formatRupiah(totalDebit)}</span>
            <span>Total Kredit: {formatRupiah(totalCredit)}</span>
            <span>{isBalanced ? "Balance ✓" : "Belum balance"}</span>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving} disabled={!isBalanced}>
              Simpan Jurnal
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
