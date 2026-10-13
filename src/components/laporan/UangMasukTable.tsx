"use client"

import { FilterableTable, type FilterableColumn } from "@/components/ui"

export interface UangMasukRow {
  id: string
  invoiceNumber: string | null
  paymentNumber: string
  clientName: string
  notes: string | null
  /** Tanggal uang masuk (paidAt kwitansi), sudah diformat untuk ditampilkan. */
  paidAtLabel: string
  /** Nominal kas riil dalam IDR (sudah dikali kurs untuk invoice non-IDR). */
  amount: number
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

const columns: FilterableColumn<UangMasukRow>[] = [
  {
    key: "invoiceNumber",
    header: "No Invoice",
    filterValue: (r) => r.invoiceNumber ?? "",
    cellClassName: "font-semibold whitespace-nowrap",
    cell: (r) => (
      <>
        <span>{r.invoiceNumber ?? "—"}</span>
        {/* Tanggal ditaruh di sini (bukan kolom sendiri) supaya tabel tetap 3 kolom seperti
            yang diminta, tapi tanggal uang masuk tidak hilang dari laporan. */}
        <span className="block text-[11px] font-medium text-slate-400">{r.paidAtLabel}</span>
      </>
    ),
  },
  {
    key: "keterangan",
    header: "Keterangan",
    filterValue: (r) => `${r.clientName} ${r.paymentNumber} ${r.notes ?? ""}`,
    cell: (r) => (
      <>
        <span className="font-semibold text-slate-800">{r.clientName}</span>
        <span className="block text-[11px] font-medium text-slate-400">
          Kwitansi {r.paymentNumber}
          {r.notes ? ` · ${r.notes}` : ""}
        </span>
      </>
    ),
  },
  {
    key: "amount",
    header: "Nominal",
    cellClassName: "font-bold text-emerald-700 whitespace-nowrap",
    cell: (r) => formatRupiah(r.amount),
  },
]

export const UangMasukTable: React.FC<{ rows: UangMasukRow[] }> = ({ rows }) => (
  <FilterableTable
    columns={columns}
    rows={rows}
    rowKey={(r) => r.id}
    pageSize={25}
    mobileCardMode
    searchPlaceholder="Cari no invoice / client / keterangan..."
    emptyMessage="Belum ada uang masuk pada bulan ini."
  />
)
