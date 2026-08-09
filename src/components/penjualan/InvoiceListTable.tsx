"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription, Button, Alert, FilterableTable, ColumnVisibilityMenu, type FilterableColumn } from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";
import { JournalButton } from "@/components/akuntansi/JournalButton";
import { useColumnVisibility } from "@/lib/use-column-visibility";

export interface InvoiceListRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  issuedAt: string | null;
  totalAmount: number;
  remaining: number;
  status: string;
  postStatus: "draft" | "posted" | "voided";
  hasCost: boolean;
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
  { key: "postStatus", label: "Posting" },
];

export const InvoiceListTable: React.FC<{ rows: InvoiceListRow[] }> = ({ rows: initialRows }) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [posting, setPosting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { isVisible, toggle } = useColumnVisibility("invoice-list", INVOICE_COLUMNS);

  const handlePost = async (id: string) => {
    setPosting(id);
    setError("");
    const res = await fetch(`/api/invoices/${id}/post`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPosting(null);
    if (!res.ok) {
      setError(data?.error || "Gagal posting invoice");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, postStatus: "posted" } : r)));
    router.refresh();
  };

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
    ...(isVisible("postStatus")
      ? [{ key: "postStatus", header: "Posting", cell: (r: InvoiceListRow) => <StatusBadge type={r.postStatus} size="sm" /> }]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.hasCost && (
            <JournalButton
              title={`Jurnal — ${r.invoiceNumber}`}
              sources={[{ sourceType: "invoice", sourceId: r.id }]}
              postUrl={r.postStatus === "draft" ? `/api/invoices/${r.id}/post` : undefined}
            />
          )}
          {r.postStatus === "draft" && (
            <Button size="sm" variant="primary" onClick={() => handlePost(r.id)} isLoading={posting === r.id}>
              Posting
            </Button>
          )}
          {r.postStatus === "posted" && (
            <VoidButton
              voidUrl={`/api/invoices/${r.id}/void`}
              itemLabel={`invoice ${r.invoiceNumber}`}
              onVoided={() => setRows((prev) => prev.map((row) => (row.id === r.id ? { ...row, postStatus: "voided" } : row)))}
            />
          )}
        </div>
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
      {error && (
        <div className="px-5 sm:px-6 pb-4">
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}
      <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage='Belum ada invoice. Klik "Buat Invoice" untuk mulai.' />
    </Card>
  );
};
