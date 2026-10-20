"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight } from "lucide-react"

import { Badge, Card, CardDescription, CardTitle, FilterableTable, type FilterableColumn } from "@/components/ui"

export interface PekerjaanRow {
  id: string
  workDate: string
  principleName: string
  companyName: string
  itemCount: number
  total: number
  invoiceId: string | null
  invoiceNumber: string | null
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso))
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

const STATUS_OPTIONS = [
  { value: "belum", label: "Belum ditagih" },
  { value: "sudah", label: "Sudah ditagih" },
]

export const DaftarPekerjaanTable: React.FC<{ rows: PekerjaanRow[] }> = ({ rows }) => {
  const router = useRouter()

  const columns: FilterableColumn<PekerjaanRow>[] = [
    {
      key: "no",
      header: "No.",
      headClassName: "w-12 text-center",
      cellClassName: "w-12 text-center text-slate-500 tabular-nums",
      cell: (_r, i) => i + 1,
    },
    {
      key: "workDate",
      header: "Tgl.",
      headClassName: "whitespace-nowrap",
      cellClassName: "whitespace-nowrap font-semibold",
      cell: (r) => formatDate(r.workDate),
    },
    {
      key: "principle",
      header: "Principle",
      filterValue: (r) => `${r.principleName} ${r.companyName}`,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 truncate">{r.principleName}</p>
          <p className="text-[11px] text-slate-500 font-medium">{r.companyName}</p>
        </div>
      ),
    },
    {
      key: "itemCount",
      header: "Jml Pekerjaan",
      headClassName: "text-center whitespace-nowrap",
      cellClassName: "text-center tabular-nums",
      cell: (r) => r.itemCount,
    },
    {
      key: "total",
      header: "Total Nominal",
      headClassName: "text-right whitespace-nowrap",
      cellClassName: "text-right font-bold text-slate-900 whitespace-nowrap tabular-nums",
      cell: (r) => formatRupiah(r.total),
    },
    {
      key: "status",
      header: "Status",
      filterValue: (r) => (r.invoiceId ? "sudah" : "belum"),
      filterOptions: STATUS_OPTIONS,
      cell: (r) =>
        r.invoiceId ? (
          <Link
            href={`/penjualan/${r.invoiceId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-bold text-emerald-700 hover:underline whitespace-nowrap"
          >
            {r.invoiceNumber}
          </Link>
        ) : (
          <Badge variant="ghost" size="sm">
            Belum ditagih
          </Badge>
        ),
    },
    {
      key: "buka",
      header: "",
      headClassName: "w-10",
      cellClassName: "w-10 text-slate-400",
      cell: () => <ChevronRight className="w-4 h-4" />,
    },
  ]

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6">
        <CardTitle>Daftar Pengajuan</CardTitle>
        <CardDescription>{rows.length} transaksi — klik barisnya untuk mengubah.</CardDescription>
      </div>
      <FilterableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        mobileCardMode
        onRowClick={(r) => router.push(`/blesscom/pekerjaan/${r.id}`)}
        searchPlaceholder="Cari principle..."
        emptyMessage='Belum ada transaksi. Klik "Tambah Transaksi" untuk mulai.'
      />
    </Card>
  )
}
