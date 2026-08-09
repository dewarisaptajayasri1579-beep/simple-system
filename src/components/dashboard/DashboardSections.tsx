"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, FilterableTable, ColumnVisibilityMenu, type FilterableColumn } from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";
import { FollowUpButtons } from "./FollowUpButtons";
import { EditablePicInfo } from "./EditablePicInfo";
import { EditableIdentifier } from "./EditableIdentifier";
import { DomainOwnerCell } from "@/components/domain/DomainOwnerCell";
import { DomainLastPaidCell } from "@/components/domain/DomainLastPaidCell";
import { MarkPaidButton, type AccountOption } from "./MarkPaidButton";
import { piutangGroupFollowUpMessage, domainFollowUpMessage, serverFollowUpMessage } from "@/lib/follow-up-templates";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import { computeDomainExpiryDate, getExpiryBucket, type ExpiryBucket } from "@/lib/domain-status";

function formatRupiah(n: number | null) {
  if (!n) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function invoiceAgeDays(issuedAt: string) {
  const ms = Date.now() - new Date(issuedAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
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
  clientId: string;
  invoiceNumber: string;
  clientName: string;
  picName: string | null;
  picPhone: string | null;
  issuedAt: string;
  dueDate: string | null;
  remaining: number;
  status: string;
}

const PIUTANG_STATUS_OPTIONS: { value: string; label: string; type: StatusBadgeType }[] = [
  { value: "unpaid", label: "Belum Dibayar", type: "unpaid" },
  { value: "partial", label: "Dicicil", type: "partial" },
  { value: "claimed_paid", label: "Diklaim Lunas", type: "claimed_paid" },
];

const PIUTANG_COLUMNS = [
  { key: "invoiceNumber", label: "No. Invoice" },
  { key: "issuedAt", label: "Tanggal Pembuatan" },
  { key: "age", label: "Umur Tagihan" },
  { key: "dueDate", label: "Jatuh Tempo" },
  { key: "remaining", label: "Sisa" },
  { key: "status", label: "Status" },
];

interface PiutangClientGroup {
  clientId: string;
  clientName: string;
  picName: string | null;
  picPhone: string | null;
  rows: PiutangSummaryRow[];
}

function piutangInvoiceColumns(clientId: string, isVisible: (key: string) => boolean): FilterableColumn<PiutangSummaryRow>[] {
  return [
    ...(isVisible("invoiceNumber")
      ? [
          {
            key: "invoiceNumber",
            header: "No. Invoice",
            filterValue: (r: PiutangSummaryRow) => r.invoiceNumber,
            cellClassName: "font-semibold",
            cell: (r: PiutangSummaryRow) => (
              <Link href={`/penjualan/${r.id}`} className="hover:underline">
                {r.invoiceNumber}
              </Link>
            ),
          },
        ]
      : []),
    ...(isVisible("issuedAt") ? [{ key: "issuedAt", header: "Tanggal Pembuatan", cell: (r: PiutangSummaryRow) => formatDate(r.issuedAt) }] : []),
    ...(isVisible("age")
      ? [{ key: "age", header: "Umur Tagihan", cell: (r: PiutangSummaryRow) => `${invoiceAgeDays(r.issuedAt)} hari` }]
      : []),
    ...(isVisible("dueDate") ? [{ key: "dueDate", header: "Jatuh Tempo", cell: (r: PiutangSummaryRow) => formatDate(r.dueDate) }] : []),
    ...(isVisible("remaining")
      ? [{ key: "remaining", header: "Sisa", cellClassName: "font-semibold text-rose-700", cell: (r: PiutangSummaryRow) => formatRupiah(r.remaining) }]
      : []),
    ...(isVisible("status")
      ? [
          {
            key: "status",
            header: "Status",
            filterValue: (r: PiutangSummaryRow) => r.status,
            filterOptions: PIUTANG_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            cell: (r: PiutangSummaryRow) => <StatusBadge type={r.status as StatusBadgeType} size="sm" />,
          },
        ]
      : []),
    {
      key: "bayar",
      header: "Aksi",
      cell: (r) => (
        <Link href={`/pembayaran?clientId=${clientId}&invoiceId=${r.id}`}>
          <Button size="sm" variant="outline">
            Bayar
          </Button>
        </Link>
      ),
    },
  ];
}

export const PiutangSummarySection: React.FC<{ rows: PiutangSummaryRow[] }> = ({ rows }) => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { isVisible, toggle } = useColumnVisibility("dashboard-piutang", PIUTANG_COLUMNS);

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  // Grup per client — client dengan invoice jatuh tempo paling dekat tampil duluan.
  const groups = useMemo(() => {
    const map = new Map<string, PiutangClientGroup>();
    for (const r of filteredRows) {
      const existing = map.get(r.clientId);
      if (existing) existing.rows.push(r);
      else map.set(r.clientId, { clientId: r.clientId, clientName: r.clientName, picName: r.picName, picPhone: r.picPhone, rows: [r] });
    }
    return Array.from(map.values()).sort((a, b) => {
      const aTime = a.rows[0].dueDate ? new Date(a.rows[0].dueDate).getTime() : Infinity;
      const bTime = b.rows[0].dueDate ? new Date(b.rows[0].dueDate).getTime() : Infinity;
      return aTime - bTime;
    });
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <CardTitle>Piutang Penjualan</CardTitle>
          <CardDescription>
            {rows.length} invoice belum lunas dari {groups.length} client
          </CardDescription>
        </div>
        <ColumnVisibilityMenu columns={PIUTANG_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>

      <Card variant="panel" padding="none">
        <div className="pt-4 sm:pt-5">
          <StatusPills active={statusFilter} onChange={setStatusFilter} options={PIUTANG_STATUS_OPTIONS} counts={counts} total={rows.length} />
        </div>
      </Card>

      {groups.length === 0 && (
        <Card variant="feature" padding="lg">
          <p className="text-center text-slate-500">Tidak ada piutang terbuka.</p>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.clientId} variant="panel" padding="none">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>{g.clientName}</CardTitle>
              <CardDescription>{g.rows.length} invoice belum lunas</CardDescription>
              <div className="flex items-center gap-2 mt-1">
                <EditablePicInfo clientId={g.clientId} picName={g.picName} picPhone={g.picPhone} />
                <FollowUpButtons
                  phone={g.picPhone}
                  clientId={g.clientId}
                  clientName={g.clientName}
                  message={piutangGroupFollowUpMessage({
                    clientName: g.clientName,
                    totalRemaining: g.rows.reduce((sum, r) => sum + r.remaining, 0),
                    invoiceCount: g.rows.length,
                  })}
                />
              </div>
            </div>
            <div className="flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-shrink-0">
              <p className="text-lg font-black text-rose-700">{formatRupiah(g.rows.reduce((sum, r) => sum + r.remaining, 0))}</p>
              <Link href={`/pembayaran?clientId=${g.clientId}`}>
                <Button size="sm" variant="primary">
                  Bayar
                </Button>
              </Link>
            </div>
          </div>
          <FilterableTable
            columns={piutangInvoiceColumns(g.clientId, isVisible)}
            rows={g.rows}
            rowKey={(r) => r.id}
            mobileCardMode
          />
        </Card>
      ))}
    </div>
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
  identifier: string | null;
  category: string;
  vendorName: string | null;
  price: number | null;
  dueDate: string | null;
  bucket: ExpiryBucket;
}

const RECURRING_COLUMNS = [
  { key: "identifier", label: "Nomor ID / Keterangan" },
  { key: "vendor", label: "Vendor" },
  { key: "category", label: "Kategori" },
  { key: "dueDate", label: "Perkiraan Jatuh Tempo" },
  { key: "price", label: "Harga" },
  { key: "status", label: "Status" },
];

export const RecurringDueSection: React.FC<{ rows: RecurringDueRow[]; accounts: AccountOption[]; isOwner: boolean }> = ({
  rows,
  accounts,
  isOwner,
}) => {
  const [statusFilter, setStatusFilter] = useState<ExpiryBucket | "all">("all");
  const { isVisible, toggle } = useColumnVisibility("dashboard-recurring", RECURRING_COLUMNS);

  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.bucket === statusFilter);

  const columns: FilterableColumn<RecurringDueRow>[] = [
    { key: "name", header: "Nama", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    ...(isVisible("identifier")
      ? [
          {
            key: "identifier",
            header: "Nomor ID / Keterangan",
            filterValue: (r: RecurringDueRow) => r.identifier ?? "",
            cell: (r: RecurringDueRow) => <EditableIdentifier billId={r.id} identifier={r.identifier} />,
          },
        ]
      : []),
    ...(isVisible("vendor") ? [{ key: "vendor", header: "Vendor", cell: (r: RecurringDueRow) => r.vendorName ?? "-" }] : []),
    ...(isVisible("category") ? [{ key: "category", header: "Kategori", cellClassName: "capitalize", cell: (r: RecurringDueRow) => r.category }] : []),
    ...(isVisible("dueDate") ? [{ key: "dueDate", header: "Perkiraan Jatuh Tempo", cell: (r: RecurringDueRow) => formatDate(r.dueDate) }] : []),
    ...(isVisible("price") ? [{ key: "price", header: "Harga", cell: (r: RecurringDueRow) => formatRupiah(r.price) }] : []),
    ...(isVisible("status")
      ? [{ key: "status", header: "Status", cell: (r: RecurringDueRow) => <StatusBadge type={bucketToStatus[r.bucket]} label={bucketLabel[r.bucket]} size="sm" /> }]
      : []),
    ...(isOwner
      ? [
          {
            key: "aksi",
            header: "Aksi",
            cell: (r: RecurringDueRow) => <MarkPaidButton url={`/api/recurring-bills/${r.id}/mark-paid`} itemLabel={r.name} accounts={accounts} />,
          },
        ]
      : []),
  ];

  return (
    <Card {...CARD_PROPS}>
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Pembayaran Rutin Bulan Ini</CardTitle>
          <CardDescription>{rows.length} biaya berkala jatuh tempo bulan ini / lewat tempo</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={RECURRING_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <StatusPills active={statusFilter} onChange={setStatusFilter} options={BUCKET_OPTIONS.slice(0, 2)} counts={bucketCounts(rows)} total={rows.length} />
      <FilterableTable columns={columns} rows={filteredRows} rowKey={(r) => r.id} emptyMessage="Tidak ada pembayaran rutin." mobileCardMode />
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
  clientId: string | null;
  clientPhone: string | null;
  price: number | null;
  lastPaidAt: string | null;
  dueDate: string | null;
  bucket: ExpiryBucket;
}

const DOMAIN_COLUMNS = [
  { key: "owner", label: "Pemilik" },
  { key: "ownerType", label: "Internal/Client" },
  { key: "lastPaidAt", label: "Terakhir Bayar" },
  { key: "dueDate", label: "Estimasi Habis" },
  { key: "price", label: "Harga Jual" },
  { key: "status", label: "Status" },
];

export const DomainExpiringSection: React.FC<{
  rows: DomainExpiringRow[];
  clients: { id: string; name: string }[];
  accounts: AccountOption[];
  isOwner: boolean;
}> = ({ rows: initialRows, clients, accounts, isOwner }) => {
  const [rows, setRows] = useState(initialRows);
  const [statusFilter, setStatusFilter] = useState<ExpiryBucket | "all">("all");
  const { isVisible, toggle } = useColumnVisibility("dashboard-domain", DOMAIN_COLUMNS);

  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.bucket === statusFilter);

  const columns: FilterableColumn<DomainExpiringRow>[] = [
    { key: "name", header: "Domain", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    ...(isVisible("owner") ? [{ key: "owner", header: "Pemilik", filterValue: (r: DomainExpiringRow) => r.owner, cell: (r: DomainExpiringRow) => r.owner }] : []),
    ...(isVisible("ownerType")
      ? [
          {
            key: "ownerType",
            header: "Internal/Client",
            filterValue: (r: DomainExpiringRow) => (r.clientId ? "client" : "internal"),
            filterOptions: [
              { value: "internal", label: "Internal (7Smarts)" },
              { value: "client", label: "Client" },
            ],
            cell: (r: DomainExpiringRow) => (
              <DomainOwnerCell
                domainId={r.id}
                domainName={r.name}
                clientId={r.clientId}
                clients={clients}
                onUpdated={(patch) =>
                  setRows((prev) =>
                    prev.map((row) =>
                      row.id === r.id ? { ...row, clientId: patch.clientId, owner: patch.clientName ?? "Internal" } : row
                    )
                  )
                }
              />
            ),
          },
        ]
      : []),
    ...(isVisible("lastPaidAt")
      ? [
          {
            key: "lastPaidAt",
            header: "Terakhir Bayar",
            cell: (r: DomainExpiringRow) => (
              <DomainLastPaidCell
                domainId={r.id}
                lastPaidAt={r.lastPaidAt}
                formatDate={(d) => formatDate(d ? d.toISOString() : null)}
                onUpdated={(lastPaidAt) =>
                  setRows((prev) =>
                    prev.map((row) => {
                      if (row.id !== r.id) return row;
                      const expiry = computeDomainExpiryDate(lastPaidAt ? new Date(lastPaidAt) : null);
                      return { ...row, lastPaidAt, dueDate: expiry ? expiry.toISOString() : null, bucket: getExpiryBucket(expiry) };
                    })
                  )
                }
              />
            ),
          },
        ]
      : []),
    ...(isVisible("dueDate") ? [{ key: "dueDate", header: "Estimasi Habis", cell: (r: DomainExpiringRow) => formatDate(r.dueDate) }] : []),
    ...(isVisible("price") ? [{ key: "price", header: "Harga Jual", cell: (r: DomainExpiringRow) => formatRupiah(r.price) }] : []),
    ...(isVisible("status")
      ? [{ key: "status", header: "Status", cell: (r: DomainExpiringRow) => <StatusBadge type={bucketToStatus[r.bucket]} label={bucketLabel[r.bucket]} size="sm" /> }]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) =>
        r.clientId ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/penjualan/baru?${new URLSearchParams({ clientId: r.clientId, description: `Perpanjangan domain ${r.name}`, amount: String(r.price ?? 0) }).toString()}`}
            >
              <Button size="sm" variant="outline">
                Tagih Sekarang
              </Button>
            </Link>
            <FollowUpButtons
              phone={r.clientPhone}
              clientId={r.clientId}
              clientName={r.owner}
              message={domainFollowUpMessage({ clientName: r.owner, domainName: r.name, dueDate: r.dueDate })}
            />
          </div>
        ) : isOwner ? (
          <MarkPaidButton url={`/api/domains/${r.id}/mark-paid`} itemLabel={r.name} accounts={accounts} />
        ) : (
          <span className="text-xs text-slate-400">Internal</span>
        ),
    },
  ];

  return (
    <Card {...CARD_PROPS}>
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Domain — Lewat / Bulan Ini / Bulan Depan</CardTitle>
          <CardDescription>{rows.length} domain sudah lewat tempo atau akan habis bulan ini/depan</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={DOMAIN_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <StatusPills active={statusFilter} onChange={setStatusFilter} options={BUCKET_OPTIONS} counts={bucketCounts(rows)} total={rows.length} />
      <FilterableTable columns={columns} rows={filteredRows} rowKey={(r) => r.id} emptyMessage="Tidak ada domain yang perlu perhatian." mobileCardMode />
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 3b. Server — lewat, habis bulan ini, habis bulan depan
// ---------------------------------------------------------------------------
export interface ServerDueRow {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  clientPhone: string | null;
  price: number | null;
  dueDate: string | null;
  bucket: ExpiryBucket;
}

const SERVER_COLUMNS = [
  { key: "client", label: "Client" },
  { key: "dueDate", label: "Estimasi Jatuh Tempo" },
  { key: "price", label: "Harga" },
  { key: "status", label: "Status" },
];

export const ServerDueSection: React.FC<{ rows: ServerDueRow[]; accounts: AccountOption[]; isOwner: boolean }> = ({
  rows,
  accounts,
  isOwner,
}) => {
  const [statusFilter, setStatusFilter] = useState<ExpiryBucket | "all">("all");
  const { isVisible, toggle } = useColumnVisibility("dashboard-server", SERVER_COLUMNS);

  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.bucket === statusFilter);

  const columns: FilterableColumn<ServerDueRow>[] = [
    { key: "name", header: "Server", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    ...(isVisible("client")
      ? [{ key: "client", header: "Client", filterValue: (r: ServerDueRow) => r.clientName ?? "", cell: (r: ServerDueRow) => r.clientName ?? "Internal" }]
      : []),
    ...(isVisible("dueDate") ? [{ key: "dueDate", header: "Estimasi Jatuh Tempo", cell: (r: ServerDueRow) => formatDate(r.dueDate) }] : []),
    ...(isVisible("price") ? [{ key: "price", header: "Harga", cell: (r: ServerDueRow) => formatRupiah(r.price) }] : []),
    ...(isVisible("status")
      ? [{ key: "status", header: "Status", cell: (r: ServerDueRow) => <StatusBadge type={bucketToStatus[r.bucket]} label={bucketLabel[r.bucket]} size="sm" /> }]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) =>
        r.clientId ? (
          <div className="flex items-center gap-2">
            <Link
              href={`/penjualan/baru?${new URLSearchParams({ clientId: r.clientId, description: `Perpanjangan server ${r.name}`, amount: String(r.price ?? 0) }).toString()}`}
            >
              <Button size="sm" variant="outline">
                Tagih Sekarang
              </Button>
            </Link>
            <FollowUpButtons
              phone={r.clientPhone}
              clientId={r.clientId}
              clientName={r.clientName ?? ""}
              message={serverFollowUpMessage({ clientName: r.clientName ?? "", serverName: r.name, dueDate: r.dueDate })}
            />
          </div>
        ) : isOwner ? (
          <MarkPaidButton url={`/api/servers/${r.id}/mark-paid`} itemLabel={r.name} accounts={accounts} />
        ) : (
          <span className="text-xs text-slate-400">Internal</span>
        ),
    },
  ];

  return (
    <Card {...CARD_PROPS}>
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Server — Lewat / Bulan Ini / Bulan Depan</CardTitle>
          <CardDescription>{rows.length} server sudah lewat tempo atau akan jatuh tempo bulan ini/depan</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={SERVER_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <StatusPills active={statusFilter} onChange={setStatusFilter} options={BUCKET_OPTIONS} counts={bucketCounts(rows)} total={rows.length} />
      <FilterableTable columns={columns} rows={filteredRows} rowKey={(r) => r.id} emptyMessage="Tidak ada server yang perlu perhatian." mobileCardMode />
    </Card>
  );
};
