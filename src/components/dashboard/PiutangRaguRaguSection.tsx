"use client";

import Link from "next/link";
import { Card, CardTitle, CardDescription, FilterableTable, type FilterableColumn } from "@/components/ui";
import { ClearStatusButton } from "./PiutangStatusTools";

/** "Piutang Ragu-Ragu" — tagihan yang sah tapi dianggap tidak akan cair (client kabur/bangkrut/
 *  sengketa). Ditandai MANUAL oleh Owner dengan alasan wajib; sejak ditandai, invoice-nya keluar
 *  dari Piutang Outstanding (Dashboard, Piutang, Neraca, Arus Kas) dan berhenti ditagih otomatis.
 *
 *  Tidak ada jurnal apa pun di balik ini — Piutang di app ini memang bukan akun GL, cuma hasil
 *  hitung Invoice.totalAmount − pembayaran posted (lihat pedoman_akunting.md). Beda dari
 *  "Batalkan" (Void) yang artinya invoice-nya salah input. */

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export interface PiutangRaguRaguRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  remaining: number;
  dueDate: string | null;
  doubtfulAt: string;
  doubtfulReason: string;
  doubtfulByName: string | null;
}

export const PiutangRaguRaguSection: React.FC<{ rows: PiutangRaguRaguRow[]; isOwner: boolean }> = ({ rows, isOwner }) => {
  const total = rows.reduce((sum, r) => sum + r.remaining, 0);

  const columns: FilterableColumn<PiutangRaguRaguRow>[] = [
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
    { key: "clientName", header: "Client", filterValue: (r) => r.clientName, cell: (r) => r.clientName },
    { key: "dueDate", header: "Jatuh Tempo", cell: (r) => formatDate(r.dueDate) },
    {
      key: "remaining",
      header: "Sisa",
      cellClassName: "font-semibold text-amber-700",
      cell: (r) => formatRupiah(r.remaining),
    },
    { key: "doubtfulAt", header: "Ditandai", cell: (r) => formatDate(r.doubtfulAt) },
    { key: "doubtfulByName", header: "Oleh", cell: (r) => r.doubtfulByName ?? "-" },
    {
      key: "doubtfulReason",
      header: "Alasan",
      filterValue: (r) => r.doubtfulReason,
      cell: (r) => <span className="text-xs text-slate-600 font-medium">{r.doubtfulReason}</span>,
    },
    ...(isOwner
      ? [
          {
            key: "aksi",
            header: "Aksi",
            cell: (r: PiutangRaguRaguRow) => (
              <ClearStatusButton
                endpoint={`/api/invoices/${r.id}/doubtful`}
                label="Aktifkan Lagi"
                confirmText={`Aktifkan lagi ${r.invoiceNumber} — ${r.clientName}? Invoice ini kembali dihitung sebagai Piutang Outstanding dan ditagih seperti biasa.`}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <CardTitle>Piutang Ragu-Ragu</CardTitle>
          <CardDescription>
            {rows.length} invoice, total {formatRupiah(total)} — sudah TIDAK dihitung di Piutang Outstanding.
          </CardDescription>
        </div>
      </div>

      <Card variant="panel" padding="none">
        <FilterableTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage="Belum ada piutang yang ditandai ragu-ragu."
          mobileCardMode
        />
      </Card>
    </div>
  );
};
