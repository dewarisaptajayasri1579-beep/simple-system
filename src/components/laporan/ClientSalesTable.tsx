"use client";

import { FilterableTable, type FilterableColumn } from "@/components/ui";

export interface ClientSalesRow {
  name: string;
  total: number;
  collected: number;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

const columns: FilterableColumn<ClientSalesRow>[] = [
  {
    key: "name",
    header: "Client",
    filterValue: (r) => r.name,
    cellClassName: "font-semibold",
    cell: (r) => r.name,
  },
  {
    key: "total",
    header: "Total Invoice",
    cell: (r) => formatRupiah(r.total),
  },
  {
    key: "collected",
    header: "Tertagih",
    cellClassName: "text-emerald-700",
    cell: (r) => formatRupiah(r.collected),
  },
  {
    key: "remaining",
    header: "Sisa",
    cellClassName: "text-rose-700 font-semibold",
    cell: (r) => formatRupiah(r.total - r.collected),
  },
];

export const ClientSalesTable: React.FC<{ rows: ClientSalesRow[] }> = ({ rows }) => (
  <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.name} emptyMessage="Tidak ada invoice pada periode ini." />
);
