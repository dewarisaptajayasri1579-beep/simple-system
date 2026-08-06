"use client";

import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, FilterableTable, ColumnVisibilityMenu, type FilterableColumn } from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import { Eye } from "lucide-react";

export interface InvoiceListRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  issuedAt: string | null;
  totalAmount: number;
  remaining: number;
  status: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

const STATUS_OPTIONS = [
  { value: "unpaid", label: "Belum Dibayar" },
  { value: "partial", label: "Dicicil" },
  { value: "paid", label: "Lunas" },
  { value: "claimed_paid", label: "Diklaim Lunas" },
];

const INVOICE_COLUMNS = [
  { key: "client", label: "Client" },
  { key: "issuedAt", label: "Tanggal" },
  { key: "total", label: "Total" },
  { key: "remaining", label: "Sisa" },
  { key: "status", label: "Status" },
];

export const InvoiceListTable: React.FC<{ rows: InvoiceListRow[] }> = ({ rows }) => {
  const { isVisible, toggle } = useColumnVisibility("invoice-list", INVOICE_COLUMNS);

  const columns: FilterableColumn<InvoiceListRow>[] = [
    {
      key: "invoiceNumber",
      header: "No. Invoice",
      filterValue: (r) => r.invoiceNumber,
      cellClassName: "font-semibold",
      cell: (r) => (
        <Link href={`/penjualan/${r.id}`} className="hover:underline">
          {r.invoiceNumber}
        </Link>
      ),
    },
    ...(isVisible("client") ? [{ key: "client", header: "Client", filterValue: (r: InvoiceListRow) => r.clientName, cell: (r: InvoiceListRow) => r.clientName }] : []),
    ...(isVisible("issuedAt") ? [{ key: "issuedAt", header: "Tanggal", cell: (r: InvoiceListRow) => formatDate(r.issuedAt) }] : []),
    ...(isVisible("total") ? [{ key: "total", header: "Total", cell: (r: InvoiceListRow) => formatRupiah(r.totalAmount) }] : []),
    ...(isVisible("remaining") ? [{ key: "remaining", header: "Sisa", cell: (r: InvoiceListRow) => formatRupiah(Math.max(0, r.remaining)) }] : []),
    ...(isVisible("status")
      ? [
          {
            key: "status",
            header: "Status",
            filterValue: (r: InvoiceListRow) => r.status,
            filterOptions: STATUS_OPTIONS,
            cell: (r: InvoiceListRow) => <StatusBadge type={r.status as StatusBadgeType} size="sm" />,
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (
        <Link href={`/penjualan/${r.id}`}>
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
          <CardTitle>Daftar Invoice</CardTitle>
          <CardDescription>{rows.length} invoice</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={INVOICE_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage='Belum ada invoice. Klik "Buat Invoice" untuk mulai.' />
    </Card>
  );
};
