"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, FilterableTable, type FilterableColumn } from "@/components/ui";

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function normalizePhoneForWaMe(raw: string) {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

export interface ProjectTagihanRow {
  scheduleId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  picPhone: string | null;
  label: string;
  dueDate: string;
  remaining: number;
  bucket?: string;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  clientName: string;
  picPhone: string | null;
  rows: ProjectTagihanRow[];
}

function projectColumns(generatingId: string | null, onGenerate: (r: ProjectTagihanRow) => void): FilterableColumn<ProjectTagihanRow>[] {
  return [
    {
      key: "label",
      header: "Termin",
      filterValue: (r) => r.label,
      cellClassName: "font-semibold",
      cell: (r) =>
        r.invoiceId ? (
          <Link href={`/penjualan/${r.invoiceId}`} className="hover:underline">
            {r.label} ({r.invoiceNumber})
          </Link>
        ) : (
          <span>
            {r.label} <span className="italic text-slate-400 font-normal">(belum ditagih)</span>
          </span>
        ),
    },
    { key: "dueDate", header: "Tgl Penagihan", cell: (r) => formatDate(r.dueDate) },
    { key: "remaining", header: "Sisa Tagih", cellClassName: "font-semibold text-rose-700", cell: (r) => formatRupiah(r.remaining) },
    {
      key: "bayar",
      header: "Aksi",
      cell: (r) =>
        r.invoiceId ? (
          <Link href={`/pembayaran?clientId=${r.clientId}&invoiceId=${r.invoiceId}`}>
            <Button size="sm" variant="outline">
              Bayar
            </Button>
          </Link>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onGenerate(r)} isLoading={generatingId === r.scheduleId}>
            Generate Invoice
          </Button>
        ),
    },
  ];
}

export const ProjectTagihanSection: React.FC<{ rows: ProjectTagihanRow[] }> = ({ rows }) => {
  const router = useRouter();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async (row: ProjectTagihanRow) => {
    setGeneratingId(row.scheduleId);
    setError("");
    const res = await fetch(`/api/projects/${row.projectId}/schedules/${row.scheduleId}/generate-invoice`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setGeneratingId(null);
    if (!res.ok) {
      setError(data?.error || "Gagal generate invoice");
      return;
    }
    router.refresh();
  };

  const groups = useMemo(() => {
    const map = new Map<string, ProjectGroup>();
    for (const r of rows) {
      const existing = map.get(r.projectId);
      if (existing) existing.rows.push(r);
      else map.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, clientName: r.clientName, picPhone: r.picPhone, rows: [r] });
    }
    return Array.from(map.values()).sort((a, b) => new Date(a.rows[0].dueDate).getTime() - new Date(b.rows[0].dueDate).getTime());
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="px-1">
        <CardTitle>Tagihan Termin Project</CardTitle>
        <CardDescription>
          {rows.length} termin belum lunas dari {groups.length} project
        </CardDescription>
      </div>

      {error && <p className="text-sm font-semibold text-rose-600 px-1">{error}</p>}

      {groups.length === 0 && (
        <Card variant="feature" padding="lg">
          <p className="text-center text-slate-500">Tidak ada tagihan termin project yang jatuh tempo bulan ini/depan.</p>
        </Card>
      )}

      {groups.map((g) => {
        const totalRemaining = g.rows.reduce((sum, r) => sum + r.remaining, 0);
        const waUrl = g.picPhone
          ? `https://wa.me/${normalizePhoneForWaMe(g.picPhone)}?text=${encodeURIComponent(
              `Halo, mengingatkan tagihan termin project "${g.projectName}" (${g.clientName}) sebesar ${formatRupiah(totalRemaining)}. Terima kasih.`
            )}`
          : null;
        return (
          <Card key={g.projectId} variant="panel" padding="none">
            <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>
                  {g.projectName} <span className="font-medium text-slate-500">— {g.clientName}</span>
                </CardTitle>
                <CardDescription>{g.rows.length} termin belum lunas</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-lg font-black text-rose-700">{formatRupiah(totalRemaining)}</p>
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">
                      Follow Up WA
                    </Button>
                  </a>
                )}
                <Link href={`/proyek/${g.projectId}`}>
                  <Button size="sm" variant="primary">
                    Detail
                  </Button>
                </Link>
              </div>
            </div>
            <FilterableTable columns={projectColumns(generatingId, handleGenerate)} rows={g.rows} rowKey={(r) => r.scheduleId} mobileCardMode />
          </Card>
        );
      })}
    </div>
  );
};
