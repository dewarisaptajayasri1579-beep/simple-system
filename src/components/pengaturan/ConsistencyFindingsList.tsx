"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ConsistencyFinding } from "@/lib/data-consistency-check";

const SEVERITY_OPTIONS = [
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
];

/** Tombol "Sinkronkan" — cuma muncul untuk temuan yang punya `sync` (sejauh ini: "Cost-link
 *  kemungkinan belum ke-sync"). Klik langsung membetulkan lastPaidAt/expiryDate item terkait
 *  lewat POST .../sync-cost-link (lihat lib/cost-link-sync.ts), lalu temuan ini dihapus dari
 *  daftar di layar (tidak perlu jalankan ulang seluruh pengecekan). */
const SyncButton: React.FC<{ finding: ConsistencyFinding; onSynced: (findingId: string) => void }> = ({ finding, onSynced }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!finding.sync) return null;
  const invoiceId = finding.sync.invoiceId;

  const handleSync = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/pengaturan/cek-konsistensi-data/sync-cost-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Gagal sinkronkan");
      return;
    }
    onSynced(finding.id);
  };

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={handleSync} isLoading={loading}>
        Sinkronkan
      </Button>
      {error && <p className="text-[11px] font-semibold text-rose-700 max-w-[180px]">{error}</p>}
    </div>
  );
};

export const ConsistencyFindingsList: React.FC<{ rows: ConsistencyFinding[] }> = ({ rows: initialRows }) => {
  const [rows, setRows] = useState(initialRows);
  const checkOptions = Array.from(new Set(rows.map((r) => r.checkLabel))).map((label) => ({ value: label, label }));

  const columns: FilterableColumn<ConsistencyFinding>[] = [
    {
      key: "checkLabel",
      header: "Jenis",
      filterValue: (r) => r.checkLabel,
      filterOptions: checkOptions,
      cellClassName: "font-semibold",
      cell: (r) => r.checkLabel,
    },
    {
      key: "severity",
      header: "Tingkat",
      filterValue: (r) => r.severity,
      filterOptions: SEVERITY_OPTIONS,
      cell: (r) => <StatusBadge type={r.severity === "error" ? "expired" : "expiring_this_month"} label={r.severity === "error" ? "Error" : "Warning"} size="sm" />,
    },
    {
      key: "entityLabel",
      header: "Item",
      filterValue: (r) => r.entityLabel,
      cell: (r) => (r.href ? <Link href={r.href} className="hover:underline font-semibold">{r.entityLabel}</Link> : r.entityLabel),
    },
    { key: "description", header: "Detail", cell: (r) => <span className="text-sm text-slate-600">{r.description}</span> },
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (r.sync ? <SyncButton finding={r} onSynced={(id) => setRows((prev) => prev.filter((row) => row.id !== id))} /> : null),
    },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6">
        <CardTitle>Daftar Temuan</CardTitle>
        <CardDescription>
          {rows.length} temuan — kebanyakan murni deteksi (perlu dicek manual), sebagian (mis. Cost-link) punya tombol "Sinkronkan" untuk dibenerin langsung.
        </CardDescription>
      </div>
      <FilterableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pageSize={20}
        emptyMessage="Tidak ada temuan — data konsisten sejauh yang dicek."
        mobileCardMode
      />
    </Card>
  );
};
