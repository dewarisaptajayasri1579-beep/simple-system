"use client"

import Link from "next/link"
import { FilterableTable, type FilterableColumn } from "@/components/ui"
import { StatusBadge } from "@/components/ui/StatusBadge"

export interface PaymentHistoryRow {
  id: string
  paymentNumber: string
  paidAt: string
  clientName: string
  totalAmount: number
  postStatus: "draft" | "posted" | "voided"
  invoiceNumbers: string[]
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

const POSTING_FILTER_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "voided", label: "Dibatalkan" },
]

export const PaymentHistoryTable: React.FC<{ rows: PaymentHistoryRow[] }> = ({ rows }) => {
  const columns: FilterableColumn<PaymentHistoryRow>[] = [
    { key: "no", header: "No", headClassName: "w-12 pl-6", cellClassName: "pl-6", cell: (_p, index) => <span className="text-slate-500">{index + 1}</span> },
    {
      key: "paymentNumber",
      header: "No. Kwitansi",
      filterValue: (p) => p.paymentNumber,
      cellClassName: "font-semibold",
      cell: (p) => (
        <Link href={`/pembayaran/${p.id}`} className="hover:underline">
          {p.paymentNumber}
        </Link>
      ),
    },
    { key: "paidAt", header: "Tanggal", filterValue: (p) => formatDate(p.paidAt), cell: (p) => formatDate(p.paidAt) },
    { key: "client", header: "Client", filterValue: (p) => p.clientName, cell: (p) => p.clientName },
    {
      key: "invoices",
      header: "Invoice Dilunasi",
      filterValue: (p) => p.invoiceNumbers.join(" "),
      cell: (p) => (p.invoiceNumbers.length ? p.invoiceNumbers.join(", ") : "-"),
    },
    { key: "total", header: "Total", filterValue: (p) => String(p.totalAmount), cellClassName: "font-semibold", cell: (p) => formatRupiah(p.totalAmount) },
    {
      key: "postStatus",
      header: "Posting",
      filterValue: (p) => p.postStatus,
      filterOptions: POSTING_FILTER_OPTIONS,
      cell: (p) => <StatusBadge type={p.postStatus} size="sm" />,
    },
  ]

  return <FilterableTable columns={columns} rows={rows} rowKey={(p) => p.id} pageSize={10} emptyMessage="Tidak ada pembayaran yang cocok." searchPlaceholder="Cari kwitansi, client, atau invoice..." />
}
