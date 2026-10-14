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
    key: "paidAt",
    header: "Tanggal",
    filterValue: (r) => r.paidAtLabel,
    cellClassName: "whitespace-nowrap font-semibold text-slate-700",
    cell: (r) => r.paidAtLabel,
  },
  {
    key: "clientName",
    header: "Client",
    filterValue: (r) => `${r.clientName} ${r.invoiceNumber ?? ""}`,
    cellClassName: "font-semibold text-slate-900",
    cell: (r) => (
      <>
        <span>{r.clientName}</span>
        {/* No invoice ditempel di bawah nama client, bukan kolom sendiri — biar kolom
            utamanya tetap empat seperti yang diminta, tapi nomor invoicenya tidak hilang
            (dipakai buat mencocokkan ke menu Invoice). */}
        <span className="block text-[11px] font-medium text-slate-400">
          {r.invoiceNumber ?? "tanpa rincian invoice"}
        </span>
      </>
    ),
  },
  {
    key: "keterangan",
    header: "Keterangan",
    filterValue: (r) => `${r.notes ?? ""} ${r.paymentNumber}`,
    cell: (r) => (
      <>
        <span className="text-slate-700">{r.notes || "—"}</span>
        <span className="block text-[11px] font-medium text-slate-400">Kwitansi {r.paymentNumber}</span>
      </>
    ),
  },
  {
    key: "amount",
    header: "Total Nominal",
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
    searchPlaceholder="Cari tanggal / client / keterangan / no invoice..."
    emptyMessage="Belum ada uang masuk pada bulan ini."
  />
)
