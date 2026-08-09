"use client";

import Link from "next/link";
import { Card, CardTitle, CardDescription, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { BillingFollowUpRefType } from "@/lib/billing-follow-up";

export type BillingFollowUpStatusKey = "aktif_dalam_batas" | "aktif_lewat" | "selesai_tepat_waktu" | "selesai_telat";

export interface BillingFollowUpRow {
  id: string;
  refType: BillingFollowUpRefType;
  refTypeLabel: string;
  itemName: string;
  clientName: string;
  invoiceNumber: string | null;
  invoiceId: string | null;
  dueAppearedAt: string;
  invoicedAt: string | null;
  clientRespondedAt: string | null;
  promisedPayAt: string | null;
  paidRecordedAt: string | null;
  statusKey: BillingFollowUpStatusKey;
  statusLabel: string;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

const REF_TYPE_OPTIONS = [
  { value: "domain", label: "Domain" },
  { value: "server", label: "Server" },
  { value: "maintenance", label: "Maintenance" },
];

const STATUS_OPTIONS: { value: BillingFollowUpStatusKey; label: string }[] = [
  { value: "aktif_dalam_batas", label: "Aktif — Dalam Batas" },
  { value: "aktif_lewat", label: "Aktif — Lewat Deadline" },
  { value: "selesai_tepat_waktu", label: "Selesai — Tepat Waktu" },
  { value: "selesai_telat", label: "Selesai — Ada yang Telat" },
];

// StatusBadge belum punya varian buat status ini — reuse warna yang paling deket maknanya.
const STATUS_BADGE_TYPE: Record<BillingFollowUpStatusKey, "expiring_this_month" | "expired" | "safe" | "partial"> = {
  aktif_dalam_batas: "expiring_this_month",
  aktif_lewat: "expired",
  selesai_tepat_waktu: "safe",
  selesai_telat: "partial",
};

const columns: FilterableColumn<BillingFollowUpRow>[] = [
  {
    key: "itemName",
    header: "Item",
    filterValue: (r) => r.itemName,
    cellClassName: "font-semibold",
    cell: (r) => (
      <div>
        <div>{r.itemName}</div>
        <div className="text-xs text-slate-500 font-normal">{r.refTypeLabel}</div>
      </div>
    ),
  },
  { key: "clientName", header: "Client", filterValue: (r) => r.clientName, cell: (r) => r.clientName },
  {
    key: "refType",
    header: "Jenis",
    filterValue: (r) => r.refType,
    filterOptions: REF_TYPE_OPTIONS,
    cell: (r) => r.refTypeLabel,
  },
  { key: "dueAppearedAt", header: "Muncul", cell: (r) => formatDate(r.dueAppearedAt) },
  {
    key: "invoicedAt",
    header: "Ditagih",
    cell: (r) =>
      r.invoiceNumber && r.invoiceId ? (
        <Link href={`/penjualan/${r.invoiceId}`} className="hover:underline">
          {r.invoiceNumber}
        </Link>
      ) : (
        formatDate(r.invoicedAt)
      ),
  },
  { key: "clientRespondedAt", header: "Jawaban Client", cell: (r) => formatDate(r.clientRespondedAt) },
  { key: "promisedPayAt", header: "Janji Bayar", cell: (r) => formatDate(r.promisedPayAt) },
  { key: "paidRecordedAt", header: "Dibayar", cell: (r) => formatDate(r.paidRecordedAt) },
  {
    key: "status",
    header: "Status",
    filterValue: (r) => r.statusKey,
    filterOptions: STATUS_OPTIONS,
    cell: (r) => <StatusBadge type={STATUS_BADGE_TYPE[r.statusKey]} label={r.statusLabel} size="sm" />,
  },
];

export const BillingFollowUpList: React.FC<{ rows: BillingFollowUpRow[] }> = ({ rows }) => {
  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6">
        <CardTitle>Riwayat Siklus</CardTitle>
        <CardDescription>{rows.length} siklus tagihan (aktif + selesai)</CardDescription>
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={20} emptyMessage="Belum ada siklus tindak-lanjut tagihan." mobileCardMode />
    </Card>
  );
};
