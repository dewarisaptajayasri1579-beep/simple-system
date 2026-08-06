"use client";

import { FilterableTable, type FilterableColumn } from "@/components/ui";

export interface CategoryBreakdownRow {
  name: string;
  kind: string;
  total: number;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

const columns: FilterableColumn<CategoryBreakdownRow>[] = [
  {
    key: "name",
    header: "Kategori",
    filterValue: (r) => r.name,
    cellClassName: "font-semibold",
    cell: (r) => r.name,
  },
  {
    key: "kind",
    header: "Tipe",
    filterValue: (r) => r.kind,
    filterOptions: [
      { value: "income", label: "Pemasukan" },
      { value: "expense", label: "Pengeluaran" },
    ],
    cellClassName: undefined,
    cell: (r) => (
      <span className={r.kind === "income" ? "text-emerald-700" : "text-rose-700"}>
        {r.kind === "income" ? "Pemasukan" : "Pengeluaran"}
      </span>
    ),
  },
  {
    key: "total",
    header: "Jumlah",
    cellClassName: "font-semibold",
    cell: (r) => formatRupiah(r.total),
  },
];

export const CategoryBreakdownTable: React.FC<{ rows: CategoryBreakdownRow[] }> = ({ rows }) => (
  <FilterableTable columns={columns} rows={rows} rowKey={(r) => `${r.kind}-${r.name}`} emptyMessage="Tidak ada transaksi pada periode ini." />
);
