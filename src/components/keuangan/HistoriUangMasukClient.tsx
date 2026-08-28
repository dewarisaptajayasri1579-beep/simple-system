"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Modal, FilterableTable, type FilterableColumn } from "@/components/ui";

export interface UangMasukRow {
  id: string;
  weekKey: string;
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

export interface WeekRecap {
  monday: string;
  sunday: string;
  count: number;
  total: number;
  isCurrent: boolean;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatShort(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Rekap mingguan uang masuk dari penjualan. Tiap minggu bisa diklik → modal berisi rincian
 *  pembayaran minggu itu (biar halaman tidak jadi panjang ke bawah). Read-only. */
export const HistoriUangMasukClient: React.FC<{
  weeks: number;
  weekRecap: WeekRecap[];
  rows: UangMasukRow[];
  grandTotal: number;
}> = ({ weeks, weekRecap, rows, grandTotal }) => {
  const [openWeek, setOpenWeek] = useState<WeekRecap | null>(null);
  const detailRows = openWeek ? rows.filter((r) => r.weekKey === openWeek.monday) : [];

  const columns: FilterableColumn<UangMasukRow>[] = [
    { key: "paidAt", header: "Tanggal", cell: (r) => formatDate(r.paidAt) },
    { key: "clientName", header: "Client", filterValue: (r) => r.clientName, cellClassName: "font-semibold", cell: (r) => r.clientName },
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
    <>
      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
          <div>
            <CardTitle>Rekap per Minggu</CardTitle>
            <CardDescription>Senin–Minggu (WIB) · klik satu minggu untuk lihat rinciannya</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total {weeks} minggu</p>
            <p className="text-lg font-black text-emerald-700">{formatRupiah(grandTotal)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="px-5 sm:px-6 py-2.5">Minggu</th>
                <th className="px-5 sm:px-6 py-2.5 text-right">Pembayaran</th>
                <th className="px-5 sm:px-6 py-2.5 text-right">Total Masuk</th>
              </tr>
            </thead>
            <tbody>
              {weekRecap.map((w) => {
                const clickable = w.count > 0;
                return (
                  <tr
                    key={w.monday}
                    onClick={clickable ? () => setOpenWeek(w) : undefined}
                    className={`border-b border-slate-50 last:border-0 ${
                      clickable ? "cursor-pointer hover:bg-blue-50/60" : "text-slate-400"
                    }`}
                  >
                    <td className="px-5 sm:px-6 py-2.5 font-semibold text-slate-800">
                      {formatShort(w.monday)} – {formatShort(w.sunday)}
                      {w.isCurrent && <span className="ml-2 text-[10px] font-bold text-blue-600">MINGGU INI</span>}
                    </td>
                    <td className="px-5 sm:px-6 py-2.5 text-right tabular-nums text-slate-500">{w.count || "-"}</td>
                    <td className="px-5 sm:px-6 py-2.5 text-right font-bold tabular-nums text-slate-900">
                      {w.total ? formatRupiah(w.total) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={openWeek != null}
        onClose={() => setOpenWeek(null)}
        size="xl"
        title={openWeek ? `Uang Masuk ${formatShort(openWeek.monday)} – ${formatShort(openWeek.sunday)}` : ""}
      >
        {openWeek && (
          <div className="flex flex-col gap-4 min-h-0">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-semibold text-slate-600">{openWeek.count} pembayaran</span>
              <span className="font-black text-emerald-700">{formatRupiah(openWeek.total)}</span>
            </div>
            <div className="overflow-y-auto -mx-2 px-2">
              <FilterableTable
                columns={columns}
                rows={detailRows}
                rowKey={(r) => r.id}
                pageSize={25}
                emptyMessage="Tidak ada pembayaran."
                mobileCardMode
              />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
