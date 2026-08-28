"use client";

import Link from "next/link";
import { Card, CardTitle, CardDescription, FilterableTable, type FilterableColumn } from "@/components/ui";

export interface UangMasukRow {
  id: string;
  paidAt: string;
  amount: number;
  clientName: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string | null;
  paymentNumber: string | null;
  accountName: string;
  notes: string | null;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Daftar uang masuk dari penjualan (InvoicePayment efektif), terbaru di atas. Read-only —
 *  entri dibuat lewat menu Pembayaran, di sini cuma histori + rekap mingguan. */
export const HistoriUangMasukTable: React.FC<{ rows: UangMasukRow[] }> = ({ rows }) => {
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const columns: FilterableColumn<UangMasukRow>[] = [
    { key: "paidAt", header: "Tanggal", cell: (r) => formatDate(r.paidAt) },
    {
      key: "clientName",
      header: "Client",
      filterValue: (r) => r.clientName,
      cellClassName: "font-semibold",
      cell: (r) => r.clientName,
    },
    {
      key: "invoiceNumber",
      header: "Invoice",
      filterValue: (r) => r.invoiceNumber,
      cell: (r) => (
        <Link href={`/penjualan/${r.invoiceId}`} className="text-blue-600 hover:underline">
          {r.invoiceNumber}
        </Link>
      ),
    },
    {
      key: "paymentNumber",
      header: "Kwitansi",
      filterValue: (r) => r.paymentNumber ?? "",
      cell: (r) =>
        r.paymentId && r.paymentNumber ? (
          <Link href={`/pembayaran/${r.paymentId}`} className="text-blue-600 hover:underline">
            {r.paymentNumber}
          </Link>
        ) : (
          <span className="text-slate-400">-</span>
        ),
    },
    { key: "accountName", header: "Akun", filterValue: (r) => r.accountName, cell: (r) => r.accountName },
    { key: "notes", header: "Catatan", cell: (r) => r.notes ?? "-" },
    { key: "amount", header: "Jumlah", cellClassName: "font-semibold text-right", cell: (r) => formatRupiah(r.amount) },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Rincian Uang Masuk</CardTitle>
          <CardDescription>{rows.length} pembayaran</CardDescription>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total</p>
          <p className="text-lg font-black text-emerald-700">{formatRupiah(total)}</p>
        </div>
      </div>
      <FilterableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        pageSize={25}
        emptyMessage="Belum ada uang masuk dari penjualan pada rentang ini."
        mobileCardMode
      />
    </Card>
  );
};
