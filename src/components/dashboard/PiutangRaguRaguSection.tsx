"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ClearStatusButton } from "./PiutangStatusTools";

/** Daftar piutang yang sudah "direm" Owner — dipakai di menu Tagihan > Piutang Ragu-Ragu.
 *
 *  Dua flag, perlakuan sama (dua-duanya KELUAR dari Piutang Outstanding dan berhenti ditagih
 *  otomatis), yang beda cuma maknanya:
 *
 *    pending    — ditunda, kemungkinan besar masih cair (client minta tempo / lagi dinego).
 *    ragu_ragu  — kemungkinan besar tidak akan cair sama sekali.
 *
 *  Tidak ada jurnal apa pun di balik ini — Piutang di app ini memang bukan akun GL, cuma hasil
 *  hitung Invoice.totalAmount − pembayaran posted (lihat pedoman_akunting.md). Beda dari
 *  "Batalkan" (Void) yang artinya invoice-nya salah input. */

export type PiutangFlag = "pending" | "ragu_ragu";

export interface PiutangRaguRaguRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  remaining: number;
  dueDate: string | null;
  flag: PiutangFlag;
  flaggedAt: string;
  flaggedReason: string;
  flaggedByName: string | null;
}

const FLAG_LABEL: Record<PiutangFlag, string> = {
  pending: "Pending",
  ragu_ragu: "Ragu-Ragu",
};

// StatusBadge belum punya varian khusus — pakai warna yang paling dekat maknanya (pending =
// masih diharapkan cair, ragu-ragu = kemungkinan hangus), sama pola dengan STATUS_BADGE_TYPE
// di BillingFollowUpList.
const FLAG_BADGE: Record<PiutangFlag, "partial" | "expired"> = {
  pending: "partial",
  ragu_ragu: "expired",
};

const FLAG_OPTIONS = [
  { value: "pending", label: FLAG_LABEL.pending },
  { value: "ragu_ragu", label: FLAG_LABEL.ragu_ragu },
];

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Endpoint per flag — dipakai tombol "Aktifkan Lagi" (DELETE). */
function endpointFor(row: PiutangRaguRaguRow) {
  return `/api/invoices/${row.id}/${row.flag === "pending" ? "pending" : "doubtful"}`;
}

export const PiutangRaguRaguSection: React.FC<{ rows: PiutangRaguRaguRow[]; isOwner: boolean }> = ({ rows, isOwner }) => {
  const [flagFilter, setFlagFilter] = useState<"all" | PiutangFlag>("all");

  const filteredRows = flagFilter === "all" ? rows : rows.filter((r) => r.flag === flagFilter);
  const total = filteredRows.reduce((sum, r) => sum + r.remaining, 0);
  const pendingCount = rows.filter((r) => r.flag === "pending").length;
  const doubtfulCount = rows.length - pendingCount;

  const columns: FilterableColumn<PiutangRaguRaguRow>[] = [
    {
      key: "flag",
      header: "Flag",
      filterValue: (r) => r.flag,
      filterOptions: FLAG_OPTIONS,
      cell: (r) => <StatusBadge type={FLAG_BADGE[r.flag]} label={FLAG_LABEL[r.flag]} size="sm" />,
    },
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
    { key: "flaggedAt", header: "Ditandai", cell: (r) => formatDate(r.flaggedAt) },
    { key: "flaggedByName", header: "Oleh", cell: (r) => r.flaggedByName ?? "-" },
    {
      key: "flaggedReason",
      header: "Alasan",
      filterValue: (r) => r.flaggedReason,
      cell: (r) => <span className="text-xs text-slate-600 font-medium">{r.flaggedReason}</span>,
    },
    ...(isOwner
      ? [
          {
            key: "aksi",
            header: "Aksi",
            cell: (r: PiutangRaguRaguRow) => (
              <ClearStatusButton
                endpoint={endpointFor(r)}
                label="Aktifkan Lagi"
                confirmText={`Aktifkan lagi ${r.invoiceNumber} — ${r.clientName}? Invoice ini kembali dihitung sebagai Piutang Outstanding dan ditagih seperti biasa.`}
              />
            ),
          },
        ]
      : []),
  ];

  const pill = (value: "all" | PiutangFlag, label: string, count: number) => (
    <button
      key={value}
      onClick={() => setFlagFilter(value)}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
        flagFilter === value
          ? "bg-[#0544cc] text-white border-[#0544cc] shadow-md shadow-blue-700/20"
          : "bg-white/60 text-slate-600 border-slate-200/80 hover:bg-white/90"
      }`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-xs font-black ${flagFilter === value ? "bg-white/20" : "bg-slate-200/80"}`}>{count}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <CardTitle>Daftar Piutang Ditahan</CardTitle>
          <CardDescription>
            {filteredRows.length} invoice, total {formatRupiah(total)} — sudah TIDAK dihitung di Piutang Outstanding.
          </CardDescription>
        </div>
      </div>

      <Card variant="panel" padding="none">
        <div className="flex flex-wrap gap-2 px-5 sm:px-6 pt-4 sm:pt-5 pb-4">
          {pill("all", "Semua", rows.length)}
          {pill("pending", FLAG_LABEL.pending, pendingCount)}
          {pill("ragu_ragu", FLAG_LABEL.ragu_ragu, doubtfulCount)}
        </div>
        <FilterableTable
          columns={columns}
          rows={filteredRows}
          rowKey={(r) => r.id}
          emptyMessage="Belum ada piutang yang ditandai pending / ragu-ragu."
          mobileCardMode
        />
      </Card>
    </div>
  );
};
