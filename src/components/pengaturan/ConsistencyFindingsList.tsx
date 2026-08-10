"use client";

import Link from "next/link";
import { Card, CardTitle, CardDescription, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ConsistencyFinding } from "@/lib/data-consistency-check";

const SEVERITY_OPTIONS = [
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
];

export const ConsistencyFindingsList: React.FC<{ rows: ConsistencyFinding[] }> = ({ rows }) => {
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
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6">
        <CardTitle>Daftar Temuan</CardTitle>
        <CardDescription>{rows.length} temuan — murni deteksi, tidak ada yang dibenerin otomatis</CardDescription>
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
