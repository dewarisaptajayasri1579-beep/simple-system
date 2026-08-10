"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription, Button, Alert, Input, CurrencyInput, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";
import { Pencil } from "lucide-react";

export interface ScheduleRow {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  paid: number;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

interface EditDraft {
  label: string;
  dueDate: string;
  amount: number;
}

export const ProjectScheduleTable: React.FC<{ projectId: string; rows: ScheduleRow[] }> = ({ projectId, rows }) => {
  const router = useRouter();
  const [generating, setGenerating] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ label: "", dueDate: "", amount: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async (scheduleId: string) => {
    setGenerating(scheduleId);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/schedules/${scheduleId}/generate-invoice`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setGenerating(null);
    if (!res.ok) {
      setError(data?.error || "Gagal generate invoice");
      return;
    }
    router.refresh();
  };

  const startEdit = (r: ScheduleRow) => {
    setError("");
    setDraft({ label: r.label, dueDate: r.dueDate.slice(0, 10), amount: r.amount });
    setEditingId(r.id);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (scheduleId: string) => {
    if (!draft.label.trim() || !draft.dueDate || draft.amount <= 0) {
      setError("Label, tanggal penagihan, dan nominal wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan jadwal");
      return;
    }
    setEditingId(null);
    router.refresh();
  };

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6">
        <CardTitle>Jadwal Pembayaran</CardTitle>
        <CardDescription>{rows.length} termin</CardDescription>
      </div>
      {error && (
        <div className="px-5 sm:px-6 pb-4">
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}
      <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Termin</TableHead>
              <TableHead>Tgl Penagihan</TableHead>
              <TableHead>Nominal Tagih</TableHead>
              <TableHead>Dibayar</TableHead>
              <TableHead>Sisa Tagih</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const remaining = Math.max(0, r.amount - r.paid);
              const status: StatusBadgeType = !r.invoiceId ? "draft" : remaining <= 0 ? "paid" : r.paid > 0 ? "partial" : "unpaid";
              const isEditing = editingId === r.id;

              if (isEditing) {
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
                    </TableCell>
                    <TableCell>
                      <input
                        type="date"
                        value={draft.dueDate}
                        onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm w-full"
                      />
                    </TableCell>
                    <TableCell colSpan={2}>
                      <CurrencyInput value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} />
                    </TableCell>
                    <TableCell>{formatRupiah(remaining)}</TableCell>
                    <TableCell>
                      <StatusBadge type={status} size="sm" label="Belum Ditagih" />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => saveEdit(r.id)} isLoading={saving}>
                          Simpan
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                          Batal
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.label}</TableCell>
                  <TableCell>{formatDate(r.dueDate)}</TableCell>
                  <TableCell>{formatRupiah(r.amount)}</TableCell>
                  <TableCell>{formatRupiah(r.paid)}</TableCell>
                  <TableCell className="font-semibold">{formatRupiah(remaining)}</TableCell>
                  <TableCell>
                    <StatusBadge type={status} size="sm" label={!r.invoiceId ? "Belum Ditagih" : undefined} />
                  </TableCell>
                  <TableCell>
                    {r.invoiceId ? (
                      <Link href={`/penjualan/${r.invoiceId}`} className="text-sm font-semibold text-slate-700 hover:underline">
                        {r.invoiceNumber}
                      </Link>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => handleGenerate(r.id)} isLoading={generating === r.id}>
                          Generate Invoice Sekarang
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => startEdit(r)} title="Edit jadwal">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
};
