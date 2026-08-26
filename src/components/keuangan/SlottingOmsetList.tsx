"use client"

import Link from "next/link"
import { Badge, FilterableTable, type FilterableColumn } from "@/components/ui"

export interface SlottingOmsetRow {
  id: string
  paymentNumber: string
  clientName: string
  createdAt: string
  grossAmount: number
  initialCostAmount: number
  additionalCostAmount: number
  netAmount: number | null
  status: "draft" | "processed" | "skipped"
}

const STATUS_BADGE: Record<SlottingOmsetRow["status"], { label: string; variant: "warning" | "success" | "secondary" }> = {
  draft: { label: "Belum Split", variant: "warning" },
  processed: { label: "Sudah Split", variant: "success" },
  skipped: { label: "Tidak Split", variant: "secondary" },
}

const STATUS_FILTER_OPTIONS = [
  { value: "draft", label: "Belum Split" },
  { value: "processed", label: "Sudah Split" },
  { value: "skipped", label: "Tidak Split" },
]

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

export const SlottingOmsetList: React.FC<{ rows: SlottingOmsetRow[] }> = ({ rows }) => {
  const columns: FilterableColumn<SlottingOmsetRow>[] = [
    {
      key: "paymentNumber",
      header: "No. Kwitansi",
      filterValue: (r) => r.paymentNumber,
      cellClassName: "font-semibold",
      cell: (r) => (
        <Link href={`/keuangan/slotting-omset/${r.id}`} className="hover:underline">
          {r.paymentNumber}
        </Link>
      ),
    },
    { key: "createdAt", header: "Tanggal", cell: (r) => formatDate(r.createdAt) },
    { key: "client", header: "Client", filterValue: (r) => r.clientName, cell: (r) => r.clientName },
    { key: "gross", header: "Uang Masuk", cellClassName: "font-semibold", cell: (r) => formatRupiah(r.grossAmount) },
    {
      key: "cost",
      header: "Total Biaya",
      cell: (r) => formatRupiah(r.initialCostAmount + r.additionalCostAmount),
    },
    {
      key: "net",
      header: "Laba Bersih",
      cellClassName: "font-semibold",
      cell: (r) => (r.netAmount != null ? formatRupiah(r.netAmount) : formatRupiah(r.grossAmount - r.initialCostAmount - r.additionalCostAmount)),
    },
    {
      key: "status",
      header: "Status",
      filterValue: (r) => STATUS_BADGE[r.status].label,
      filterOptions: STATUS_FILTER_OPTIONS,
      cell: (r) => <Badge variant={STATUS_BADGE[r.status].variant} size="sm">{STATUS_BADGE[r.status].label}</Badge>,
    },
  ]

  return (
    <FilterableTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      pageSize={20}
      emptyMessage="Belum ada Slotting Omset — dibuat otomatis begitu ada pembayaran yang diposting."
      searchPlaceholder="Cari kwitansi atau client..."
    />
  )
}
