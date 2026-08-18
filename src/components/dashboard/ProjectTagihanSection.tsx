"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, FilterableTable, type FilterableColumn } from "@/components/ui";
import { waWebUrl, WA_WEB_WINDOW_NAME } from "@/lib/phone";

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
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

interface ProjectTotal {
  projectName: string;
  clientName: string;
  totalRemaining: number;
  scheduleCount: number;
}

function projectTagihanColumns(
  projectTotals: Map<string, ProjectTotal>,
  generatingId: string | null,
  onGenerate: (r: ProjectTagihanRow) => void
): FilterableColumn<ProjectTagihanRow>[] {
  return [
    {
      key: "project",
      header: "Project",
      filterValue: (r) => `${r.projectName} ${r.clientName}`,
      cellClassName: "font-semibold",
      cell: (r) => {
        const totals = projectTotals.get(r.projectId);
        const waUrl = r.picPhone && totals
          ? waWebUrl(r.picPhone, `Halo, mengingatkan tagihan termin project "${totals.projectName}" (${totals.clientName}) sebesar ${formatRupiah(totals.totalRemaining)}. Terima kasih.`)
          : null;
        return (
          <div className="space-y-1">
            <Link href={`/proyek/${r.projectId}`} className="hover:underline">
              {r.projectName}
            </Link>
            <div className="text-xs text-slate-500">{r.clientName}</div>
            {waUrl && (
              <a href={waUrl} target={WA_WEB_WINDOW_NAME} rel="noopener noreferrer" className="inline-block">
                <Button size="sm" variant="outline">
                  Follow Up WA
                </Button>
              </a>
            )}
          </div>
        );
      },
    },
    {
      key: "label",
      header: "Termin",
      filterValue: (r) => r.label,
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

  // Total per project (dipakai buat pesan follow-up WA di kolom Project) — bukan buat grouping,
  // tabelnya sengaja dibiarkan flat 1 baris per termin biar lebih enak dibaca (sama pola dengan
  // Piutang Penjualan).
  const projectTotals = useMemo(() => {
    const map = new Map<string, ProjectTotal>();
    for (const r of rows) {
      const existing = map.get(r.projectId);
      if (existing) {
        existing.totalRemaining += r.remaining;
        existing.scheduleCount += 1;
      } else {
        map.set(r.projectId, { projectName: r.projectName, clientName: r.clientName, totalRemaining: r.remaining, scheduleCount: 1 });
      }
    }
    return map;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="px-1">
        <CardTitle>Tagihan Termin Project</CardTitle>
        <CardDescription>
          {rows.length} termin belum lunas dari {projectTotals.size} project
        </CardDescription>
      </div>

      {error && <p className="text-sm font-semibold text-rose-600 px-1">{error}</p>}

      <Card variant="panel" padding="none">
        <FilterableTable
          columns={projectTagihanColumns(projectTotals, generatingId, handleGenerate)}
          rows={rows}
          rowKey={(r) => r.scheduleId}
          emptyMessage="Tidak ada tagihan termin project yang jatuh tempo bulan ini/depan."
          mobileCardMode
        />
      </Card>
    </div>
  );
};
