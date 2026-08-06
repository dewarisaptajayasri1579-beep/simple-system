"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";
import type { ExpiryBucket } from "@/lib/domain-status";

function formatRupiah(n: number | null) {
  if (!n) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

interface StatusPillsProps<S extends string> {
  active: S | "all";
  onChange: (value: S | "all") => void;
  options: { value: S; label: string; type: StatusBadgeType }[];
  counts: Record<string, number>;
  total: number;
}

function StatusPills<S extends string>({ active, onChange, options, counts, total }: StatusPillsProps<S>) {
  return (
    <div className="flex flex-wrap gap-2 px-5 sm:px-6 pb-4">
      <button
        onClick={() => onChange("all")}
        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
          active === "all"
            ? "bg-[#0544cc] text-white border-[#0544cc] shadow-md shadow-blue-700/20"
            : "bg-white/60 text-slate-600 border-slate-200/80 hover:bg-white/90"
        }`}
      >
        Semua
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-black ${active === "all" ? "bg-white/20" : "bg-slate-200/80"}`}>{total}</span>
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={active === opt.value ? "ring-2 ring-offset-1 ring-[#0544cc] rounded-xl cursor-pointer" : "cursor-pointer"}
        >
          <StatusBadge type={opt.type} label={opt.label} count={counts[opt.value] ?? 0} size="sm" />
        </button>
      ))}
    </div>
  );
}

const CARD_PROPS = { variant: "panel" as const, padding: "none" as const };

// ---------------------------------------------------------------------------
// 1. Piutang Penjualan
// ---------------------------------------------------------------------------
export interface PiutangSummaryRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  picName: string | null;
  picPhone: string | null;
  dueDate: string | null;
  remaining: number;
  status: string;
}

const PIUTANG_STATUS_OPTIONS: { value: string; label: string; type: StatusBadgeType }[] = [
  { value: "unpaid", label: "Belum Dibayar", type: "unpaid" },
  { value: "partial", label: "Dicicil", type: "partial" },
  { value: "claimed_paid", label: "Diklaim Lunas", type: "claimed_paid" },
];

export const PiutangSummarySection: React.FC<{ rows: PiutangSummaryRow[] }> = ({ rows }) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  const columns: FilterableColumn<PiutangSummaryRow>[] = [
    { key: "client", header: "Client", filterValue: (r) => r.clientName, cellClassName: "font-semibold", cell: (r) => r.clientName },
    { key: "pic", header: "PIC", filterValue: (r) => r.picName ?? "", cell: (r) => r.picName ?? "-" },
    { key: "picPhone", header: "No. WA PIC", filterValue: (r) => r.picPhone ?? "", cell: (r) => r.picPhone ?? "-" },
    {
      key: "invoiceNumber",
      header: "No. Invoice",
      cell: (r) => (
        <Link href={`/penjualan/${r.id}`} className="hover:underline">
          {r.invoiceNumber}
        </Link>
      ),
    },
    { key: "dueDate", header: "Jatuh Tempo", cell: (r) => formatDate(r.dueDate) },
    { key: "remaining", header: "Sisa", cellClassName: "font-semibold text-rose-700", cell: (r) => formatRupiah(r.remaining) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={r.status as StatusBadgeType} size="sm" /> },
  ];

  return (
    <Card {...CARD_PROPS}>
      <CardHeader className="p-5 sm:p-6 mb-0">
        <CardTitle>Piutang Penjualan</CardTitle>
        <CardDescription>{rows.length} invoice belum lunas</CardDescription>
      </CardHeader>
      <StatusPills active={statusFilter} onChange={setStatusFilter} options={PIUTANG_STATUS_OPTIONS} counts={counts} total={rows.length} />
      <FilterableTable columns={columns} rows={filteredRows} rowKey={(r) => r.id} emptyMessage="Tidak ada piutang terbuka." />
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Bucket vocabulary dipakai bersama oleh Biaya Berkala, Domain, dan Server.
// ---------------------------------------------------------------------------
const bucketToStatus: Record<ExpiryBucket, StatusBadgeType> = {
  expired: "expired",
  expiring_this_month: "expiring_this_month",
  expiring_next_month: "expiring_next_month",
  safe: "safe",
};
const bucketLabel: Record<ExpiryBucket, string> = {
  expired: "Lewat",
  expiring_this_month: "Bulan Ini",
  expiring_next_month: "Bulan Depan",
  safe: "Aman",
};
const BUCKET_OPTIONS: { value: ExpiryBucket; label: string; type: StatusBadgeType }[] = [
  { value: "expired", label: bucketLabel.expired, type: bucketToStatus.expired },
  { value: "expiring_this_month", label: bucketLabel.expiring_this_month, type: bucketToStatus.expiring_this_month },
  { value: "expiring_next_month", label: bucketLabel.expiring_next_month, type: bucketToStatus.expiring_next_month },
];

function bucketCounts(rows: { bucket: ExpiryBucket }[]) {
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.bucket] = (acc[r.bucket] ?? 0) + 1;
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// 2. Pembayaran Rutin bulan ini
// ---------------------------------------------------------------------------
export interface RecurringDueRow {
  id: string;
  name: string;
  category: string;
  vendorName: string | null;
  price: number | null;
  dueDate: string | null;
  bucket: ExpiryBucket;
}

export const RecurringDueSection: React.FC<{ rows: RecurringDueRow[] }> = ({ rows }) => {
  const [statusFilter, setStatusFilter] = useState<ExpiryBucket | "all">("all");

  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.bucket === statusFilter);

  const columns: FilterableColumn<RecurringDueRow>[] = [
    { key: "name", header: "Nama", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    { key: "vendor", header: "Vendor", cell: (r) => r.vendorName ?? "-" },
    { key: "category", header: "Kategori", cellClassName: "capitalize", cell: (r) => r.category },
    { key: "dueDate", header: "Perkiraan Jatuh Tempo", cell: (r) => formatDate(r.dueDate) },
    { key: "price", header: "Harga", cell: (r) => formatRupiah(r.price) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={bucketToStatus[r.bucket]} label={bucketLabel[r.bucket]} size="sm" /> },
  ];

  return (
    <Card {...CARD_PROPS}>
      <CardHeader className="p-5 sm:p-6 mb-0">
        <CardTitle>Pembayaran Rutin Bulan Ini</CardTitle>
        <CardDescription>{rows.length} biaya berkala jatuh tempo bulan ini / lewat tempo</CardDescription>
      </CardHeader>
      <StatusPills active={statusFilter} onChange={setStatusFilter} options={BUCKET_OPTIONS.slice(0, 2)} counts={bucketCounts(rows)} total={rows.length} />
      <FilterableTable columns={columns} rows={filteredRows} rowKey={(r) => r.id} emptyMessage="Tidak ada pembayaran rutin." />
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 3a. Domain — lewat, habis bulan ini, habis bulan depan
// ---------------------------------------------------------------------------
export interface DomainExpiringRow {
  id: string;
  name: string;
  owner: string;
  price: number | null;
  dueDate: string | null;
  bucket: ExpiryBucket;
}

export const DomainExpiringSection: React.FC<{ rows: DomainExpiringRow[] }> = ({ rows }) => {
  const [statusFilter, setStatusFilter] = useState<ExpiryBucket | "all">("all");

  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.bucket === statusFilter);

  const columns: FilterableColumn<DomainExpiringRow>[] = [
    { key: "name", header: "Domain", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    { key: "owner", header: "Pemilik", filterValue: (r) => r.owner, cell: (r) => r.owner },
    { key: "dueDate", header: "Estimasi Habis", cell: (r) => formatDate(r.dueDate) },
    { key: "price", header: "Harga Jual", cell: (r) => formatRupiah(r.price) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={bucketToStatus[r.bucket]} label={bucketLabel[r.bucket]} size="sm" /> },
  ];

  return (
    <Card {...CARD_PROPS}>
      <CardHeader className="p-5 sm:p-6 mb-0">
        <CardTitle>Domain — Lewat / Bulan Ini / Bulan Depan</CardTitle>
        <CardDescription>{rows.length} domain sudah lewat tempo atau akan habis bulan ini/depan</CardDescription>
      </CardHeader>
      <StatusPills active={statusFilter} onChange={setStatusFilter} options={BUCKET_OPTIONS} counts={bucketCounts(rows)} total={rows.length} />
      <FilterableTable columns={columns} rows={filteredRows} rowKey={(r) => r.id} emptyMessage="Tidak ada domain yang perlu perhatian." />
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 3b. Server — lewat, habis bulan ini, habis bulan depan
// ---------------------------------------------------------------------------
export interface ServerDueRow {
  id: string;
  name: string;
  price: number | null;
  dueDate: string | null;
  bucket: ExpiryBucket;
}

export const ServerDueSection: React.FC<{ rows: ServerDueRow[] }> = ({ rows }) => {
  const [statusFilter, setStatusFilter] = useState<ExpiryBucket | "all">("all");

  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.bucket === statusFilter);

  const columns: FilterableColumn<ServerDueRow>[] = [
    { key: "name", header: "Server", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    { key: "dueDate", header: "Estimasi Jatuh Tempo", cell: (r) => formatDate(r.dueDate) },
    { key: "price", header: "Harga", cell: (r) => formatRupiah(r.price) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={bucketToStatus[r.bucket]} label={bucketLabel[r.bucket]} size="sm" /> },
  ];

  return (
    <Card {...CARD_PROPS}>
      <CardHeader className="p-5 sm:p-6 mb-0">
        <CardTitle>Server — Lewat / Bulan Ini / Bulan Depan</CardTitle>
        <CardDescription>{rows.length} server sudah lewat tempo atau akan jatuh tempo bulan ini/depan</CardDescription>
      </CardHeader>
      <StatusPills active={statusFilter} onChange={setStatusFilter} options={BUCKET_OPTIONS} counts={bucketCounts(rows)} total={rows.length} />
      <FilterableTable columns={columns} rows={filteredRows} rowKey={(r) => r.id} emptyMessage="Tidak ada server yang perlu perhatian." />
    </Card>
  );
};
