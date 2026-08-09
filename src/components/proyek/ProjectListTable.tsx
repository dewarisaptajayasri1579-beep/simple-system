"use client";

import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, FilterableTable, ColumnVisibilityMenu, type FilterableColumn } from "@/components/ui";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import { Eye } from "lucide-react";

export interface ProjectListRow {
  id: string;
  name: string;
  clientName: string;
  startDate: string;
  endDate: string | null;
  status: string;
  totalValue: number;
  remaining: number;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

const STATUS_LABEL: Record<string, string> = { berjalan: "Berjalan", selesai: "Selesai", batal: "Batal" };
const STATUS_STYLE: Record<string, string> = {
  berjalan: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  selesai: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  batal: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

const STATUS_OPTIONS = [
  { value: "berjalan", label: "Berjalan" },
  { value: "selesai", label: "Selesai" },
  { value: "batal", label: "Batal" },
];

const PROJECT_COLUMNS = [
  { key: "client", label: "Client" },
  { key: "period", label: "Periode" },
  { key: "totalValue", label: "Nilai Total" },
  { key: "remaining", label: "Sisa Tagih" },
  { key: "status", label: "Status" },
];

export const ProjectListTable: React.FC<{ rows: ProjectListRow[] }> = ({ rows }) => {
  const { isVisible, toggle } = useColumnVisibility("project-list", PROJECT_COLUMNS);

  const columns: FilterableColumn<ProjectListRow>[] = [
    {
      key: "name",
      header: "Nama Proyek",
      filterValue: (r) => r.name,
      cellClassName: "font-semibold",
      cell: (r) => (
        <Link href={`/proyek/${r.id}`} className="hover:underline">
          {r.name}
        </Link>
      ),
    },
    ...(isVisible("client") ? [{ key: "client", header: "Client", filterValue: (r: ProjectListRow) => r.clientName, cell: (r: ProjectListRow) => r.clientName }] : []),
    ...(isVisible("period")
      ? [{ key: "period", header: "Periode", cell: (r: ProjectListRow) => `${formatDate(r.startDate)} - ${formatDate(r.endDate)}` }]
      : []),
    ...(isVisible("totalValue") ? [{ key: "totalValue", header: "Nilai Total", cell: (r: ProjectListRow) => formatRupiah(r.totalValue) }] : []),
    ...(isVisible("remaining") ? [{ key: "remaining", header: "Sisa Tagih", cell: (r: ProjectListRow) => formatRupiah(r.remaining) }] : []),
    ...(isVisible("status")
      ? [
          {
            key: "status",
            header: "Status",
            filterValue: (r: ProjectListRow) => r.status,
            filterOptions: STATUS_OPTIONS,
            cell: (r: ProjectListRow) => (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_STYLE[r.status] ?? STATUS_STYLE.berjalan}`}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (
        <Link href={`/proyek/${r.id}`}>
          <Button size="sm" variant="ghost" leftIcon={<Eye className="w-4 h-4" />}>
            Detail
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Daftar Proyek</CardTitle>
          <CardDescription>{rows.length} proyek</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={PROJECT_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage='Belum ada proyek. Klik "Buat Proyek" untuk mulai.' />
    </Card>
  );
};
