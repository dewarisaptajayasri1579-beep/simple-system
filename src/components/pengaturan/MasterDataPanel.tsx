"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Select,
  Modal,
  Alert,
  ColumnVisibilityMenu,
  FilterableTable,
  CurrencyInput,
  type FilterableColumn,
} from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";
import { Plus, Eye, EyeOff, Pencil } from "lucide-react";
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status";
import { computeDomainExpiryDate, getExpiryBucket } from "@/lib/domain-status";
import { useColumnVisibility } from "@/lib/use-column-visibility";
import { CategorySection } from "./CategorySection";

export interface VendorRow {
  id: string;
  name: string;
  website: string | null;
}
export interface LookupRow {
  id: string;
  name: string;
}
export interface ServerRow {
  id: string;
  name: string;
  ipAddress: string | null;
  vendorId: string | null;
  cloudTypeId: string | null;
  core: string | null;
  ram: string | null;
  storage: string | null;
  periodId: string | null;
  periodCount: number | null;
  price: number | null;
  lastPaidAt: string | null;
  active: boolean;
  vendor: { name: string } | null;
  cloudType: { name: string } | null;
  period: { name: string; reminderDaysBefore: number } | null;
}
export interface CpanelAccountRow {
  id: string;
  name: string;
  username: string | null;
  password: string | null;
  cloudTypeId: string | null;
  packageId: string | null;
  active: boolean;
  cloudType: { name: string } | null;
  package: { name: string } | null;
}
export interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  picName: string | null;
  picPhone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
}
export interface DomainRow {
  id: string;
  name: string;
  clientId: string | null;
  sellPrice: number | null;
  lastPaidAt: string | null;
  active: boolean;
  client: { name: string } | null;
}
export interface RecurringBillRow {
  id: string;
  name: string;
  category: string;
  vendorId: string | null;
  price: number | null;
  lastPaidAt: string | null;
  active: boolean;
  vendor: { name: string } | null;
  period: { name: string; reminderDaysBefore: number } | null;
}
export interface ItemRow {
  id: string;
  name: string;
  type: string;
  defaultPrice: number;
  defaultCost: number;
  unit: string | null;
  active: boolean;
}
export interface LegacySalesClientRow {
  id: string;
  kode: string | null;
  name: string;
  phoneNumber: string | null;
  address: string | null;
  bankName: string | null;
  bankAccount: string | null;
  paymentTermDays: number | null;
  creditLimit: number | null;
  client: { id: string; name: string } | null;
}

function formatRupiah(n: number | null) {
  if (!n) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}
function formatDateObj(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
}

const bucketToStatus = { overdue: "expired", due_soon: "expiring_this_month", ok: "safe" } as const;
const bucketLabel = { overdue: "Lewat Jatuh Tempo", due_soon: "Segera Jatuh Tempo", ok: "Aman" } as const;
const ACTIVE_FILTER_OPTIONS = [
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Non-Aktif" },
];

const ActiveToggle: React.FC<{ active: boolean; onToggle: () => void; disabled?: boolean }> = ({ active, onToggle, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={active}
    aria-label={active ? "Nonaktifkan" : "Aktifkan"}
    onClick={onToggle}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
      active ? "bg-emerald-500" : "bg-slate-300"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
        active ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </button>
);

// ---------------------------------------------------------------------------
// Lookup sederhana: Jenis Cloud & Paket Hosting (cuma nama)
// ---------------------------------------------------------------------------
const LookupSection: React.FC<{ title: string; endpoint: string; rows: LookupRow[] }> = ({ title, endpoint, rows: initialRows }) => {
  const [rows, setRows] = useState(initialRows);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
    if (res.ok) {
      const created = await res.json();
      setRows((prev) => [...prev, created]);
      setNewName("");
    }
  };

  const handleSaveEdit = async (id: string) => {
    const res = await fetch(`${endpoint}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editingName }) });
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, name: editingName } : r)));
      setEditingId(null);
    }
  };

  return (
    <Card variant="panel" padding="lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{rows.length} item</CardDescription>
      </CardHeader>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            {editingId === r.id ? (
              <>
                <Input sizeVariant="sm" value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                <Button size="sm" variant="primary" onClick={() => handleSaveEdit(r.id)}>
                  Simpan
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Batal
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm font-medium text-slate-800">{r.name}</span>
                <button
                  onClick={() => {
                    setEditingId(r.id);
                    setEditingName(r.name);
                  }}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200/60">
        <Input sizeVariant="sm" placeholder={`${title} baru`} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button size="sm" variant="outline" onClick={handleAdd} leftIcon={<Plus className="w-4 h-4" />}>
          Tambah
        </Button>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Vendor (nama + website)
// ---------------------------------------------------------------------------
const VENDOR_COLUMNS = [{ key: "website", label: "Website" }];

const VendorSection: React.FC<{ rows: VendorRow[] }> = ({ rows: initialRows }) => {
  const [rows, setRows] = useState(initialRows);
  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const { isVisible, toggle } = useColumnVisibility("vendor", VENDOR_COLUMNS);

  const columns: FilterableColumn<VendorRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Nama", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    ...(isVisible("website")
      ? [{ key: "website", header: "Website", filterValue: (r: VendorRow) => r.website ?? "", cell: (r: VendorRow) => r.website ?? "-" }]
      : []),
  ];

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, website: newWebsite }),
    });
    if (res.ok) {
      const created = await res.json();
      setRows((prev) => [...prev, created]);
      setNewName("");
      setNewWebsite("");
    }
  };

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Vendor</CardTitle>
          <CardDescription>{rows.length} vendor</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={VENDOR_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(v) => v.id} emptyMessage="Tidak ada vendor yang cocok." />
      <div className="flex flex-col sm:flex-row gap-2 p-5 sm:p-6 pt-4 border-t border-slate-200/60">
        <Input sizeVariant="sm" placeholder="Nama vendor baru" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Input sizeVariant="sm" placeholder="Website (opsional)" value={newWebsite} onChange={(e) => setNewWebsite(e.target.value)} />
        <Button size="sm" variant="outline" onClick={handleAdd} leftIcon={<Plus className="w-4 h-4" />}>
          Tambah
        </Button>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const SERVER_COLUMNS = [
  { key: "ip", label: "IP" },
  { key: "vendor", label: "Vendor" },
  { key: "spec", label: "Spek" },
  { key: "price", label: "Harga" },
  { key: "lastPaid", label: "Terakhir Bayar" },
  { key: "dueDate", label: "Estimasi Jatuh Tempo" },
  { key: "status", label: "Status" },
  { key: "aktif", label: "Aktif" },
];

const ServerSection: React.FC<{ rows: ServerRow[]; vendors: VendorRow[]; cloudTypes: LookupRow[] }> = ({
  rows: initialRows,
  vendors,
  cloudTypes,
}) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<ServerRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<Partial<ServerRow>>({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { isVisible, toggle } = useColumnVisibility("server", SERVER_COLUMNS);

  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: v.id, label: v.name })), [vendors]);
  const cloudTypeOptions = useMemo(() => cloudTypes.map((c) => ({ value: c.id, label: c.name })), [cloudTypes]);

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [paying, setPaying] = useState<ServerRow | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payError, setPayError] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts);
  }, []);
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);

  const openPay = (server: ServerRow) => {
    setPaying(server);
    setPayAccountId(accounts[0]?.id ?? "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayError("");
  };
  const closePay = () => setPaying(null);

  const handleConfirmPay = async () => {
    if (!paying) return;
    if (!payAccountId) {
      setPayError("Pilih akun kas/bank dulu");
      return;
    }
    setIsPaying(true);
    setPayError("");
    const res = await fetch(`/api/servers/${paying.id}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: payAccountId, paidAt: payDate }),
    });
    const data = await res.json();
    setIsPaying(false);
    if (!res.ok) {
      setPayError(data.error || "Gagal mencatat pembayaran");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === paying.id ? { ...r, ...data.server } : r)));
    closePay();
    router.refresh();
  };

  const openEdit = (row: ServerRow) => {
    setEditing(row);
    setForm({ ...row, lastPaidAt: row.lastPaidAt ? row.lastPaidAt.slice(0, 10) : undefined });
    setError("");
  };
  const openCreate = () => {
    setIsCreating(true);
    setForm({ active: true });
    setError("");
  };
  const close = () => {
    setEditing(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      setError("Nama server wajib diisi");
      return;
    }
    setIsSaving(true);
    setError("");
    const url = editing ? `/api/servers/${editing.id}` : "/api/servers";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan");
      return;
    }
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    } else {
      setRows((prev) => [...prev, data]);
    }
    close();
    router.refresh();
  };

  const handleToggleActive = async (server: ServerRow) => {
    setTogglingId(server.id);
    const res = await fetch(`/api/servers/${server.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !server.active }),
    });
    if (res.ok) {
      const data = await res.json();
      setRows((prev) => prev.map((r) => (r.id === server.id ? { ...r, ...data } : r)));
      router.refresh();
    }
    setTogglingId(null);
  };

  const bucketOf = (s: ServerRow) =>
    getDueBucket(computeNextDueDate(s.lastPaidAt ? new Date(s.lastPaidAt) : null, s.period?.name, s.periodCount), s.period?.reminderDaysBefore ?? 7);

  const columns: FilterableColumn<ServerRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Nama", filterValue: (s) => s.name, cellClassName: "font-semibold", cell: (s) => s.name },
    ...(isVisible("ip") ? [{ key: "ip", header: "IP", filterValue: (s: ServerRow) => s.ipAddress ?? "", cell: (s: ServerRow) => s.ipAddress ?? "-" }] : []),
    ...(isVisible("vendor")
      ? [{ key: "vendor", header: "Vendor", filterValue: (s: ServerRow) => s.vendor?.name ?? "", cell: (s: ServerRow) => s.vendor?.name ?? "-" }]
      : []),
    ...(isVisible("spec")
      ? [
          {
            key: "spec",
            header: "Spek",
            filterValue: (s: ServerRow) => [s.core, s.ram, s.storage].filter(Boolean).join(" / "),
            cell: (s: ServerRow) => [s.core, s.ram, s.storage].filter(Boolean).join(" / ") || "-",
          },
        ]
      : []),
    ...(isVisible("price") ? [{ key: "price", header: "Harga", cell: (s: ServerRow) => formatRupiah(s.price) }] : []),
    ...(isVisible("lastPaid")
      ? [{ key: "lastPaid", header: "Terakhir Bayar", cell: (s: ServerRow) => formatDateObj(s.lastPaidAt ? new Date(s.lastPaidAt) : null) }]
      : []),
    ...(isVisible("dueDate")
      ? [
          {
            key: "dueDate",
            header: "Estimasi Jatuh Tempo",
            cell: (s: ServerRow) =>
              formatDateObj(computeNextDueDate(s.lastPaidAt ? new Date(s.lastPaidAt) : null, s.period?.name, s.periodCount)),
          },
        ]
      : []),
    ...(isVisible("status")
      ? [
          {
            key: "status",
            header: "Status",
            filterValue: (s: ServerRow) => bucketOf(s),
            filterOptions: [
              { value: "overdue", label: bucketLabel.overdue },
              { value: "due_soon", label: bucketLabel.due_soon },
              { value: "ok", label: bucketLabel.ok },
            ],
            cell: (s: ServerRow) => {
              if (!s.active) return <StatusBadge type="inactive" size="sm" />;
              const bucket = bucketOf(s);
              return <StatusBadge type={bucketToStatus[bucket] as StatusBadgeType} label={bucketLabel[bucket]} size="sm" />;
            },
          },
        ]
      : []),
    ...(isVisible("aktif")
      ? [
          {
            key: "aktif",
            header: "Aktif",
            filterValue: (s: ServerRow) => (s.active ? "active" : "inactive"),
            filterOptions: ACTIVE_FILTER_OPTIONS,
            cell: (s: ServerRow) => (
              <ActiveToggle active={s.active} disabled={togglingId === s.id} onToggle={() => handleToggleActive(s)} />
            ),
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (s) => (
        <div className="flex items-center gap-1.5">
          {s.active && s.price ? (
            <Button size="sm" variant="outline" onClick={() => openPay(s)}>
              Tandai Lunas
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const activeCount = rows.filter((s) => s.active).length;

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Server</CardTitle>
          <CardDescription>
            {activeCount} aktif{rows.length > activeCount ? `, ${rows.length - activeCount} nonaktif` : ""}
          </CardDescription>
        </div>
        <ColumnVisibilityMenu columns={SERVER_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <div className="px-5 sm:px-6 pb-2 flex flex-col sm:flex-row gap-3">
        <Button size="sm" variant="outline" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Tambah Server
        </Button>
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(s) => s.id} emptyMessage="Tidak ada server yang cocok." />

      <Modal isOpen={paying !== null} onClose={closePay} title={paying ? `Tandai Lunas — ${paying.name}` : ""}>
        <div className="space-y-4">
          {payError && (
            <Alert variant="error" onClose={() => setPayError("")}>
              {payError}
            </Alert>
          )}
          <p className="text-sm text-slate-600">
            Nominal: <span className="font-bold text-slate-900">{formatRupiah(paying?.price ?? 0)}</span>
          </p>
          <Select label="Dibayar dari Akun" options={accountOptions} value={payAccountId} onChange={setPayAccountId} placeholder="Pilih Kas/Bank" />
          <Input label="Tanggal Bayar" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={closePay}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleConfirmPay} isLoading={isPaying}>
              Konfirmasi Lunas
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={editing !== null || isCreating} onClose={close} title={editing ? `Edit ${editing.name}` : "Server Baru"} size="lg">
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nama" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input label="IP Address" value={form.ipAddress ?? ""} onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))} />
            <Select label="Vendor" options={vendorOptions} value={form.vendorId ?? ""} onChange={(v) => setForm((f) => ({ ...f, vendorId: v }))} placeholder="Pilih vendor" />
            <Select label="Jenis Cloud" options={cloudTypeOptions} value={form.cloudTypeId ?? ""} onChange={(v) => setForm((f) => ({ ...f, cloudTypeId: v }))} placeholder="Pilih jenis" />
            <Input label="Core" value={form.core ?? ""} onChange={(e) => setForm((f) => ({ ...f, core: e.target.value }))} />
            <Input label="RAM" value={form.ram ?? ""} onChange={(e) => setForm((f) => ({ ...f, ram: e.target.value }))} />
            <Input label="Storage" value={form.storage ?? ""} onChange={(e) => setForm((f) => ({ ...f, storage: e.target.value }))} />
            <CurrencyInput label="Harga" value={form.price ?? 0} onChange={(v) => setForm((f) => ({ ...f, price: v }))} />
            <Input
              label="Terakhir Bayar"
              type="date"
              value={form.lastPaidAt ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, lastPaidAt: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="w-5 h-5" />
            <span className="text-sm font-semibold text-slate-700">Aktif</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Akun cPanel
// ---------------------------------------------------------------------------
const CPANEL_COLUMNS = [
  { key: "username", label: "Username" },
  { key: "password", label: "Password" },
  { key: "cloudType", label: "Jenis Cloud" },
  { key: "package", label: "Paket" },
  { key: "aktif", label: "Aktif" },
];

const CpanelAccountSection: React.FC<{ rows: CpanelAccountRow[]; cloudTypes: LookupRow[]; packages: LookupRow[] }> = ({
  rows: initialRows,
  cloudTypes,
  packages,
}) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [visiblePasswordId, setVisiblePasswordId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CpanelAccountRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<Partial<CpanelAccountRow>>({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { isVisible, toggle } = useColumnVisibility("cpanel", CPANEL_COLUMNS);

  const cloudTypeOptions = useMemo(() => cloudTypes.map((c) => ({ value: c.id, label: c.name })), [cloudTypes]);
  const packageOptions = useMemo(() => packages.map((p) => ({ value: p.id, label: p.name })), [packages]);

  const openEdit = (row: CpanelAccountRow) => {
    setEditing(row);
    setForm(row);
    setError("");
  };
  const openCreate = () => {
    setIsCreating(true);
    setForm({ active: true });
    setError("");
  };
  const close = () => {
    setEditing(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      setError("Nama akun wajib diisi");
      return;
    }
    setIsSaving(true);
    setError("");
    const url = editing ? `/api/cpanel-accounts/${editing.id}` : "/api/cpanel-accounts";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan");
      return;
    }
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    } else {
      setRows((prev) => [...prev, data]);
    }
    close();
    router.refresh();
  };

  const handleToggleActive = async (account: CpanelAccountRow) => {
    setTogglingId(account.id);
    const res = await fetch(`/api/cpanel-accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !account.active }),
    });
    if (res.ok) {
      const data = await res.json();
      setRows((prev) => prev.map((r) => (r.id === account.id ? { ...r, ...data } : r)));
      router.refresh();
    }
    setTogglingId(null);
  };

  const columns: FilterableColumn<CpanelAccountRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Nama", filterValue: (a) => a.name, cellClassName: "font-semibold", cell: (a) => a.name },
    ...(isVisible("username")
      ? [{ key: "username", header: "Username", filterValue: (a: CpanelAccountRow) => a.username ?? "", cell: (a: CpanelAccountRow) => a.username ?? "-" }]
      : []),
    ...(isVisible("password")
      ? [
          {
            key: "password",
            header: "Password",
            cell: (a: CpanelAccountRow) => (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{a.password ? (visiblePasswordId === a.id ? a.password : "••••••••") : "-"}</span>
                {a.password && (
                  <button
                    onClick={() => setVisiblePasswordId(visiblePasswordId === a.id ? null : a.id)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {visiblePasswordId === a.id ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
    ...(isVisible("cloudType")
      ? [{ key: "cloudType", header: "Jenis Cloud", filterValue: (a: CpanelAccountRow) => a.cloudType?.name ?? "", cell: (a: CpanelAccountRow) => a.cloudType?.name ?? "-" }]
      : []),
    ...(isVisible("package")
      ? [{ key: "package", header: "Paket", filterValue: (a: CpanelAccountRow) => a.package?.name ?? "", cell: (a: CpanelAccountRow) => a.package?.name ?? "-" }]
      : []),
    ...(isVisible("aktif")
      ? [
          {
            key: "aktif",
            header: "Aktif",
            filterValue: (a: CpanelAccountRow) => (a.active ? "active" : "inactive"),
            filterOptions: ACTIVE_FILTER_OPTIONS,
            cell: (a: CpanelAccountRow) => (
              <ActiveToggle active={a.active} disabled={togglingId === a.id} onToggle={() => handleToggleActive(a)} />
            ),
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (a) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
          <Pencil className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  const activeCount = rows.filter((a) => a.active).length;

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Akun cPanel</CardTitle>
          <CardDescription>
            {activeCount} aktif{rows.length > activeCount ? `, ${rows.length - activeCount} nonaktif` : ""} — password dimigrasi apa adanya dari sistem lama, disembunyikan by default.
          </CardDescription>
        </div>
        <ColumnVisibilityMenu columns={CPANEL_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <div className="px-5 sm:px-6 pb-2 flex flex-col sm:flex-row gap-3">
        <Button size="sm" variant="outline" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Tambah Akun
        </Button>
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(a) => a.id} emptyMessage="Tidak ada akun cPanel yang cocok." />

      <Modal isOpen={editing !== null || isCreating} onClose={close} title={editing ? `Edit ${editing.name}` : "Akun cPanel Baru"}>
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Input label="Nama" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Username" value={form.username ?? ""} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <Input label="Password" value={form.password ?? ""} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <Select label="Jenis Cloud" options={cloudTypeOptions} value={form.cloudTypeId ?? ""} onChange={(v) => setForm((f) => ({ ...f, cloudTypeId: v }))} placeholder="Pilih jenis" />
          <Select label="Paket Hosting" options={packageOptions} value={form.packageId ?? ""} onChange={(v) => setForm((f) => ({ ...f, packageId: v }))} placeholder="Pilih paket" />
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="w-5 h-5" />
            <span className="text-sm font-semibold text-slate-700">Aktif</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
const CLIENT_COLUMNS = [
  { key: "city", label: "Kota" },
  { key: "phone", label: "No. HP" },
  { key: "pic", label: "PIC" },
];

const ClientSection: React.FC<{ rows: ClientRow[] }> = ({ rows: initialRows }) => {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<Partial<ClientRow>>({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { isVisible, toggle } = useColumnVisibility("client", CLIENT_COLUMNS);

  const openEdit = (row: ClientRow) => {
    setEditing(row);
    setForm(row);
    setError("");
  };
  const openCreate = () => {
    setIsCreating(true);
    setForm({});
    setError("");
  };
  const close = () => {
    setEditing(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      setError("Nama client wajib diisi");
      return;
    }
    setIsSaving(true);
    setError("");
    const url = editing ? `/api/clients/${editing.id}` : "/api/clients";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan");
      return;
    }
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    } else {
      setRows((prev) => [...prev, data]);
    }
    close();
  };

  const columns: FilterableColumn<ClientRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Nama", filterValue: (c) => c.name, cellClassName: "font-semibold", cell: (c) => c.name },
    ...(isVisible("city") ? [{ key: "city", header: "Kota", filterValue: (c: ClientRow) => c.city ?? "", cell: (c: ClientRow) => c.city ?? "-" }] : []),
    ...(isVisible("phone")
      ? [{ key: "phone", header: "No. HP", filterValue: (c: ClientRow) => c.phoneNumber ?? "", cell: (c: ClientRow) => c.phoneNumber ?? "-" }]
      : []),
    ...(isVisible("pic") ? [{ key: "pic", header: "PIC", filterValue: (c: ClientRow) => c.picName ?? "", cell: (c: ClientRow) => c.picName ?? "-" }] : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (c) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
          <Pencil className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Data Pelanggan</CardTitle>
          <CardDescription>{rows.length} client</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={CLIENT_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <div className="px-5 sm:px-6 pb-4 flex flex-col sm:flex-row gap-3">
        <Button size="sm" variant="outline" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Tambah Client
        </Button>
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(c) => c.id} emptyMessage="Tidak ada client yang cocok." />

      <Modal isOpen={editing !== null || isCreating} onClose={close} title={editing ? `Edit ${editing.name}` : "Client Baru"} size="lg">
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nama" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input label="Email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <Input label="No. HP" value={form.phoneNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
            <Input label="Kota" value={form.city ?? ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            <Input label="Nama PIC" value={form.picName ?? ""} onChange={(e) => setForm((f) => ({ ...f, picName: e.target.value }))} />
            <Input label="No. HP PIC" value={form.picPhone ?? ""} onChange={(e) => setForm((f) => ({ ...f, picPhone: e.target.value }))} />
          </div>
          <Input label="Alamat" value={form.address ?? ""} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          <Input label="Catatan" value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------
const DOMAIN_COLUMNS = [
  { key: "client", label: "Client" },
  { key: "hasClient", label: "Status Client" },
  { key: "price", label: "Harga Jual" },
  { key: "lastPaid", label: "Terakhir Bayar" },
  { key: "expiry", label: "Estimasi Habis" },
  { key: "status", label: "Status" },
  { key: "aktif", label: "Aktif" },
];

const DOMAIN_CLIENT_STATUS_OPTIONS = [
  { value: "belum", label: "Belum ada Client" },
  { value: "ada", label: "Sudah ada Client" },
];

const DOMAIN_STATUS_OPTIONS = [
  { value: "expired", label: "Sudah Lewat" },
  { value: "expiring_this_month", label: "Bulan Ini" },
  { value: "expiring_next_month", label: "Bulan Depan" },
  { value: "safe", label: "Aman" },
];

const DomainSection: React.FC<{ rows: DomainRow[] }> = ({ rows: initialRows }) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { isVisible, toggle } = useColumnVisibility("domain", DOMAIN_COLUMNS);

  const bucketOf = (domain: DomainRow) => getExpiryBucket(computeDomainExpiryDate(domain.lastPaidAt ? new Date(domain.lastPaidAt) : null));

  const activeRows = rows.filter((r) => r.active);
  const counts = {
    expired: activeRows.filter((r) => bucketOf(r) === "expired").length,
    thisMonth: activeRows.filter((r) => bucketOf(r) === "expiring_this_month").length,
    nextMonth: activeRows.filter((r) => bucketOf(r) === "expiring_next_month").length,
  };

  const handleToggleActive = async (domain: DomainRow) => {
    setTogglingId(domain.id);
    const res = await fetch(`/api/domains/${domain.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !domain.active }),
    });
    if (res.ok) {
      const data = await res.json();
      setRows((prev) => prev.map((r) => (r.id === domain.id ? { ...r, ...data } : r)));
      router.refresh();
    }
    setTogglingId(null);
  };

  const columns: FilterableColumn<DomainRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Domain", filterValue: (d) => d.name, cellClassName: "font-semibold", cell: (d) => d.name },
    ...(isVisible("client")
      ? [{ key: "client", header: "Client", filterValue: (d: DomainRow) => d.client?.name ?? "", cell: (d: DomainRow) => d.client?.name ?? "-" }]
      : []),
    ...(isVisible("hasClient")
      ? [
          {
            key: "hasClient",
            header: "Status Client",
            filterValue: (d: DomainRow) => (d.clientId ? "ada" : "belum"),
            filterOptions: DOMAIN_CLIENT_STATUS_OPTIONS,
            cell: (d: DomainRow) =>
              d.clientId ? (
                <span className="text-xs font-semibold text-emerald-700">Sudah ada</span>
              ) : (
                <span className="text-xs font-semibold text-amber-700">Belum ada</span>
              ),
          },
        ]
      : []),
    ...(isVisible("price") ? [{ key: "price", header: "Harga Jual", cell: (d: DomainRow) => formatRupiah(d.sellPrice) }] : []),
    ...(isVisible("lastPaid")
      ? [{ key: "lastPaid", header: "Terakhir Bayar", cell: (d: DomainRow) => formatDateObj(d.lastPaidAt ? new Date(d.lastPaidAt) : null) }]
      : []),
    ...(isVisible("expiry")
      ? [{ key: "expiry", header: "Estimasi Habis", cell: (d: DomainRow) => formatDateObj(computeDomainExpiryDate(d.lastPaidAt ? new Date(d.lastPaidAt) : null)) }]
      : []),
    ...(isVisible("status")
      ? [
          {
            key: "status",
            header: "Status",
            filterValue: (d: DomainRow) => bucketOf(d),
            filterOptions: DOMAIN_STATUS_OPTIONS,
            cell: (d: DomainRow) => (d.active ? <StatusBadge type={bucketOf(d)} size="sm" /> : <StatusBadge type="inactive" size="sm" />),
          },
        ]
      : []),
    ...(isVisible("aktif")
      ? [
          {
            key: "aktif",
            header: "Aktif",
            filterValue: (d: DomainRow) => (d.active ? "active" : "inactive"),
            filterOptions: ACTIVE_FILTER_OPTIONS,
            cell: (d: DomainRow) => (
              <ActiveToggle active={d.active} disabled={togglingId === d.id} onToggle={() => handleToggleActive(d)} />
            ),
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (domain) => {
        if (!domain.active) return "-";
        const bucket = bucketOf(domain);
        const needsRenewal = bucket !== "safe" && domain.clientId;
        if (!needsRenewal) return "-";
        const renewalParams = new URLSearchParams({
          clientId: domain.clientId ?? "",
          description: `Perpanjangan domain ${domain.name}`,
          amount: String(domain.sellPrice ?? 0),
        });
        return (
          <Link href={`/penjualan/baru?${renewalParams.toString()}`}>
            <Button size="sm" variant="outline">
              Buat Invoice Perpanjangan
            </Button>
          </Link>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card variant="feature" padding="md">
          <CardDescription>Sudah Lewat</CardDescription>
          <p className="text-2xl font-black text-rose-700 mt-1">{counts.expired}</p>
        </Card>
        <Card variant="feature" padding="md">
          <CardDescription>Habis Bulan Ini</CardDescription>
          <p className="text-2xl font-black text-amber-700 mt-1">{counts.thisMonth}</p>
        </Card>
        <Card variant="feature" padding="md">
          <CardDescription>Habis Bulan Depan</CardDescription>
          <p className="text-2xl font-black text-sky-700 mt-1">{counts.nextMonth}</p>
        </Card>
      </div>

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
          <div>
            <CardTitle>Domain</CardTitle>
            <CardDescription>
              {activeRows.length} aktif{rows.length > activeRows.length ? `, ${rows.length - activeRows.length} nonaktif` : ""}
            </CardDescription>
          </div>
          <ColumnVisibilityMenu columns={DOMAIN_COLUMNS} isVisible={isVisible} onToggle={toggle} />
        </div>
        <FilterableTable columns={columns} rows={rows} rowKey={(d) => d.id} emptyMessage="Tidak ada domain yang cocok." />
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Biaya Berkala
// ---------------------------------------------------------------------------
const BILL_BUCKET_STATUS = { overdue: "expired", due_soon: "expiring_this_month", ok: "safe" } as const;
const BILL_BUCKET_LABEL = { overdue: "Lewat Jatuh Tempo", due_soon: "Segera Jatuh Tempo", ok: "Aman" } as const;

const BILL_COLUMNS = [
  { key: "category", label: "Kategori" },
  { key: "vendor", label: "Vendor" },
  { key: "period", label: "Periode" },
  { key: "price", label: "Nominal" },
  { key: "lastPaid", label: "Terakhir Bayar" },
  { key: "dueDate", label: "Estimasi Jatuh Tempo" },
  { key: "status", label: "Status" },
  { key: "aktif", label: "Aktif" },
];

const BILL_STATUS_OPTIONS = [
  { value: "overdue", label: BILL_BUCKET_LABEL.overdue },
  { value: "due_soon", label: BILL_BUCKET_LABEL.due_soon },
  { value: "ok", label: BILL_BUCKET_LABEL.ok },
];

const BILL_CATEGORY_OPTIONS = [
  { value: "kantor", label: "Kantor" },
  { value: "pribadi", label: "Pribadi" },
  { value: "lainnya", label: "Lainnya" },
];

const BiayaBerkalaSection: React.FC<{ rows: RecurringBillRow[]; vendors: VendorRow[] }> = ({ rows: initialRows, vendors }) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<RecurringBillRow | null>(null);
  const [form, setForm] = useState<Partial<RecurringBillRow>>({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const { isVisible, toggle } = useColumnVisibility("recurring-bill", BILL_COLUMNS);

  const vendorOptions = useMemo(() => vendors.map((v) => ({ value: v.id, label: v.name })), [vendors]);

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [paying, setPaying] = useState<RecurringBillRow | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payError, setPayError] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then(setAccounts);
  }, []);
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);

  const openPay = (bill: RecurringBillRow) => {
    setPaying(bill);
    setPayAccountId(accounts[0]?.id ?? "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayError("");
  };
  const closePay = () => setPaying(null);

  const handleConfirmPay = async () => {
    if (!paying) return;
    if (!payAccountId) {
      setPayError("Pilih akun kas/bank dulu");
      return;
    }
    setIsPaying(true);
    setPayError("");
    const res = await fetch(`/api/recurring-bills/${paying.id}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: payAccountId, paidAt: payDate }),
    });
    const data = await res.json();
    setIsPaying(false);
    if (!res.ok) {
      setPayError(data.error || "Gagal mencatat pembayaran");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === paying.id ? { ...r, ...data.bill } : r)));
    closePay();
    router.refresh();
  };

  const bucketsOf = (bill: RecurringBillRow) =>
    getDueBucket(computeNextDueDate(bill.lastPaidAt ? new Date(bill.lastPaidAt) : null, bill.period?.name, null), bill.period?.reminderDaysBefore ?? 7);
  const activeRows = rows.filter((b) => b.active);
  const overdueCount = activeRows.filter((b) => bucketsOf(b) === "overdue").length;
  const dueSoonCount = activeRows.filter((b) => bucketsOf(b) === "due_soon").length;

  const openEdit = (row: RecurringBillRow) => {
    setEditing(row);
    setForm({ ...row, lastPaidAt: row.lastPaidAt ? row.lastPaidAt.slice(0, 10) : undefined });
    setError("");
  };
  const close = () => setEditing(null);

  const handleSave = async () => {
    if (!editing) return;
    if (!form.name?.trim()) {
      setError("Nama biaya berkala wajib diisi");
      return;
    }
    setIsSaving(true);
    setError("");
    const res = await fetch(`/api/recurring-bills/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan");
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    close();
    router.refresh();
  };

  const handleToggleActive = async (bill: RecurringBillRow) => {
    setTogglingId(bill.id);
    const res = await fetch(`/api/recurring-bills/${bill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !bill.active }),
    });
    if (res.ok) {
      const data = await res.json();
      setRows((prev) => prev.map((r) => (r.id === bill.id ? { ...r, ...data } : r)));
      router.refresh();
    }
    setTogglingId(null);
  };

  const columns: FilterableColumn<RecurringBillRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Nama", filterValue: (b) => b.name, cellClassName: "font-semibold", cell: (b) => b.name },
    ...(isVisible("category")
      ? [{ key: "category", header: "Kategori", filterValue: (b: RecurringBillRow) => b.category, cellClassName: "capitalize", cell: (b: RecurringBillRow) => b.category }]
      : []),
    ...(isVisible("vendor")
      ? [{ key: "vendor", header: "Vendor", filterValue: (b: RecurringBillRow) => b.vendor?.name ?? "", cell: (b: RecurringBillRow) => b.vendor?.name ?? "-" }]
      : []),
    ...(isVisible("period")
      ? [{ key: "period", header: "Periode", filterValue: (b: RecurringBillRow) => b.period?.name ?? "", cell: (b: RecurringBillRow) => b.period?.name ?? "-" }]
      : []),
    ...(isVisible("price") ? [{ key: "price", header: "Nominal", cell: (b: RecurringBillRow) => formatRupiah(b.price) }] : []),
    ...(isVisible("lastPaid")
      ? [{ key: "lastPaid", header: "Terakhir Bayar", cell: (b: RecurringBillRow) => formatDateObj(b.lastPaidAt ? new Date(b.lastPaidAt) : null) }]
      : []),
    ...(isVisible("dueDate")
      ? [
          {
            key: "dueDate",
            header: "Estimasi Jatuh Tempo",
            cell: (b: RecurringBillRow) =>
              formatDateObj(computeNextDueDate(b.lastPaidAt ? new Date(b.lastPaidAt) : null, b.period?.name, null)),
          },
        ]
      : []),
    ...(isVisible("status")
      ? [
          {
            key: "status",
            header: "Status",
            filterValue: (b: RecurringBillRow) => bucketsOf(b),
            filterOptions: BILL_STATUS_OPTIONS,
            cell: (b: RecurringBillRow) => {
              if (!b.active) return <StatusBadge type="inactive" size="sm" />;
              const bucket = bucketsOf(b);
              return <StatusBadge type={BILL_BUCKET_STATUS[bucket]} label={BILL_BUCKET_LABEL[bucket]} size="sm" />;
            },
          },
        ]
      : []),
    ...(isVisible("aktif")
      ? [
          {
            key: "aktif",
            header: "Aktif",
            filterValue: (b: RecurringBillRow) => (b.active ? "active" : "inactive"),
            filterOptions: ACTIVE_FILTER_OPTIONS,
            cell: (b: RecurringBillRow) => (
              <ActiveToggle active={b.active} disabled={togglingId === b.id} onToggle={() => handleToggleActive(b)} />
            ),
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (b) => (
        <div className="flex items-center gap-1.5">
          {b.active && b.price ? (
            <Button size="sm" variant="outline" onClick={() => openPay(b)}>
              Tandai Lunas
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card variant="feature" padding="md">
          <CardDescription>Lewat Jatuh Tempo</CardDescription>
          <p className="text-2xl font-black text-rose-700 mt-1">{overdueCount}</p>
        </Card>
        <Card variant="feature" padding="md">
          <CardDescription>Segera Jatuh Tempo</CardDescription>
          <p className="text-2xl font-black text-amber-700 mt-1">{dueSoonCount}</p>
        </Card>
      </div>

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
          <div>
            <CardTitle>Biaya Berkala</CardTitle>
            <CardDescription>
              {activeRows.length} aktif{rows.length > activeRows.length ? `, ${rows.length - activeRows.length} nonaktif` : ""}. Yang nonaktif tidak masuk Laporan & Dashboard.
            </CardDescription>
          </div>
          <ColumnVisibilityMenu columns={BILL_COLUMNS} isVisible={isVisible} onToggle={toggle} />
        </div>
        <FilterableTable columns={columns} rows={rows} rowKey={(b) => b.id} emptyMessage="Tidak ada biaya berkala yang cocok." />
      </Card>

      <Modal isOpen={paying !== null} onClose={closePay} title={paying ? `Tandai Lunas — ${paying.name}` : ""}>
        <div className="space-y-4">
          {payError && (
            <Alert variant="error" onClose={() => setPayError("")}>
              {payError}
            </Alert>
          )}
          <p className="text-sm text-slate-600">
            Nominal: <span className="font-bold text-slate-900">{formatRupiah(paying?.price ?? 0)}</span>
          </p>
          <Select label="Dibayar dari Akun" options={accountOptions} value={payAccountId} onChange={setPayAccountId} placeholder="Pilih Kas/Bank" />
          <Input label="Tanggal Bayar" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={closePay}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleConfirmPay} isLoading={isPaying}>
              Konfirmasi Lunas
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={editing !== null} onClose={close} title={editing ? `Edit ${editing.name}` : ""} size="lg">
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nama" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Select label="Vendor" options={vendorOptions} value={form.vendorId ?? ""} onChange={(v) => setForm((f) => ({ ...f, vendorId: v }))} placeholder="Pilih vendor" />
            <Select
              label="Kategori"
              options={BILL_CATEGORY_OPTIONS}
              value={form.category ?? "kantor"}
              onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            />
            <CurrencyInput label="Nominal" value={form.price ?? 0} onChange={(v) => setForm((f) => ({ ...f, price: v }))} />
            <Input
              label="Terakhir Bayar"
              type="date"
              value={form.lastPaidAt ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, lastPaidAt: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="w-5 h-5" />
            <span className="text-sm font-semibold text-slate-700">Aktif</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Jasa (katalog Item — dipakai buat pilih-dari-daftar di invoice)
// ---------------------------------------------------------------------------
const ITEM_COLUMNS = [
  { key: "type", label: "Tipe" },
  { key: "price", label: "Harga Jual" },
  { key: "cost", label: "HPP" },
  { key: "unit", label: "Satuan" },
  { key: "active", label: "Status" },
];

const ITEM_STATUS_OPTIONS = [
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
];

const ItemSection: React.FC<{ rows: ItemRow[] }> = ({ rows: initialRows }) => {
  const [rows, setRows] = useState(initialRows);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<Partial<ItemRow>>({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { isVisible, toggle } = useColumnVisibility("item", ITEM_COLUMNS);

  const openEdit = (row: ItemRow) => {
    setEditing(row);
    setForm(row);
    setError("");
  };
  const openCreate = () => {
    setIsCreating(true);
    setForm({ type: "jasa", active: true });
    setError("");
  };
  const close = () => {
    setEditing(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) {
      setError("Nama jasa wajib diisi");
      return;
    }
    setIsSaving(true);
    setError("");
    const url = editing ? `/api/items/${editing.id}` : "/api/items";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    setIsSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan");
      return;
    }
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    } else {
      setRows((prev) => [...prev, data]);
    }
    close();
  };

  const columns: FilterableColumn<ItemRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Nama", filterValue: (item) => item.name, cellClassName: "font-semibold", cell: (item) => item.name },
    ...(isVisible("type")
      ? [{ key: "type", header: "Tipe", cellClassName: "capitalize", filterValue: (item: ItemRow) => item.type, cell: (item: ItemRow) => item.type }]
      : []),
    ...(isVisible("price") ? [{ key: "price", header: "Harga Jual", cell: (item: ItemRow) => formatRupiah(item.defaultPrice) }] : []),
    ...(isVisible("cost") ? [{ key: "cost", header: "HPP", cell: (item: ItemRow) => formatRupiah(item.defaultCost) }] : []),
    ...(isVisible("unit") ? [{ key: "unit", header: "Satuan", cell: (item: ItemRow) => item.unit ?? "-" }] : []),
    ...(isVisible("active")
      ? [
          {
            key: "active",
            header: "Status",
            filterValue: (item: ItemRow) => (item.active ? "active" : "inactive"),
            filterOptions: ITEM_STATUS_OPTIONS,
            cell: (item: ItemRow) => <StatusBadge type={item.active ? "safe" : "inactive"} label={item.active ? "Aktif" : "Nonaktif"} size="sm" />,
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (item) => (
        <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
          <Pencil className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Jasa</CardTitle>
          <CardDescription>{rows.length} item di katalog</CardDescription>
        </div>
        <ColumnVisibilityMenu columns={ITEM_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <div className="px-5 sm:px-6 pb-4">
        <Button size="sm" variant="outline" onClick={openCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Tambah Jasa
        </Button>
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(item) => item.id} emptyMessage="Tidak ada jasa yang cocok." />

      <Modal isOpen={editing !== null || isCreating} onClose={close} title={editing ? `Edit ${editing.name}` : "Jasa Baru"}>
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Input label="Nama" value={form.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Select
            label="Tipe"
            options={[{ value: "jasa", label: "Jasa" }, { value: "barang", label: "Barang" }]}
            value={form.type ?? "jasa"}
            onChange={(v) => setForm((f) => ({ ...f, type: v }))}
            searchable={false}
          />
          <div className="grid grid-cols-2 gap-4">
            <CurrencyInput label="Harga Jual" value={form.defaultPrice ?? 0} onChange={(v) => setForm((f) => ({ ...f, defaultPrice: v }))} />
            <CurrencyInput label="HPP" value={form.defaultCost ?? 0} onChange={(v) => setForm((f) => ({ ...f, defaultCost: v }))} />
          </div>
          <Input label="Satuan (opsional)" value={form.unit ?? ""} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="w-5 h-5" />
            <span className="text-sm font-semibold text-slate-700">Aktif</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Pelanggan Baru (staging dari migrasi aplikasi penjualan — belum digabung ke Client utama)
// ---------------------------------------------------------------------------
const LEGACY_CLIENT_COLUMNS = [
  { key: "phone", label: "No. HP" },
  { key: "address", label: "Alamat" },
  { key: "bank", label: "Bank" },
  { key: "term", label: "Termin (hari)" },
  { key: "limit", label: "Plafon" },
  { key: "status", label: "Status" },
];

const LEGACY_CLIENT_STATUS_OPTIONS = [
  { value: "linked", label: "Sudah terhubung" },
  { value: "unlinked", label: "Belum digabung" },
];

const LegacyClientStagingSection: React.FC<{ rows: LegacySalesClientRow[] }> = ({ rows: initialRows }) => {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const { isVisible, toggle } = useColumnVisibility("legacy-client", LEGACY_CLIENT_COLUMNS);

  const linkedCount = rows.filter((r) => r.client).length;

  const handlePromote = async (row: LegacySalesClientRow) => {
    setPromotingId(row.id);
    try {
      const res = await fetch(`/api/legacy-sales-clients/${row.id}/promote`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, client: { id: data.id, name: data.name } } : r)));
        router.refresh();
      }
    } finally {
      setPromotingId(null);
    }
  };

  const columns: FilterableColumn<LegacySalesClientRow>[] = [
    { key: "no", header: "No", headClassName: "w-12", cell: (_r, i) => <span className="text-slate-500">{i + 1}</span> },
    { key: "name", header: "Nama", filterValue: (r) => r.name, cellClassName: "font-semibold", cell: (r) => r.name },
    ...(isVisible("phone") ? [{ key: "phone", header: "No. HP", filterValue: (r: LegacySalesClientRow) => r.phoneNumber ?? "", cell: (r: LegacySalesClientRow) => r.phoneNumber ?? "-" }] : []),
    ...(isVisible("address")
      ? [{ key: "address", header: "Alamat", cellClassName: "max-w-[220px] truncate", cell: (r: LegacySalesClientRow) => r.address ?? "-" }]
      : []),
    ...(isVisible("bank")
      ? [{ key: "bank", header: "Bank", cell: (r: LegacySalesClientRow) => (r.bankName ? `${r.bankName} — ${r.bankAccount ?? "-"}` : "-") }]
      : []),
    ...(isVisible("term") ? [{ key: "term", header: "Termin (hari)", cell: (r: LegacySalesClientRow) => r.paymentTermDays ?? "-" }] : []),
    ...(isVisible("limit") ? [{ key: "limit", header: "Plafon", cell: (r: LegacySalesClientRow) => formatRupiah(r.creditLimit) }] : []),
    ...(isVisible("status")
      ? [
          {
            key: "status",
            header: "Status",
            filterValue: (r: LegacySalesClientRow) => (r.client ? "linked" : "unlinked"),
            filterOptions: LEGACY_CLIENT_STATUS_OPTIONS,
            cell: (r: LegacySalesClientRow) =>
              r.client ? (
                <StatusBadge type="paid" label={`Terhubung: ${r.client.name}`} size="sm" />
              ) : (
                <StatusBadge type="unpaid" label="Belum digabung" size="sm" />
              ),
          },
        ]
      : []),
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) =>
        !r.client && (
          <Button size="sm" variant="outline" onClick={() => handlePromote(r)} isLoading={promotingId === r.id}>
            Jadikan Client Baru
          </Button>
        ),
    },
  ];

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div>
          <CardTitle>Pelanggan Baru (Staging)</CardTitle>
          <CardDescription>
            {rows.length} pelanggan dari migrasi aplikasi penjualan — {linkedCount} sudah terhubung ke Client, sisanya perlu
            dicocokkan manual (kemungkinan duplikat dengan Client yang sudah ada di tab Pelanggan).
          </CardDescription>
        </div>
        <ColumnVisibilityMenu columns={LEGACY_CLIENT_COLUMNS} isVisible={isVisible} onToggle={toggle} />
      </div>
      <FilterableTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyMessage="Tidak ada pelanggan yang cocok." />
    </Card>
  );
};

// ---------------------------------------------------------------------------

const MASTER_TABS = [
  { value: "domain", label: "Domain" },
  { value: "recurring-bill", label: "Biaya Berkala" },
  { value: "client", label: "Pelanggan" },
  { value: "legacy-client", label: "Pelanggan Baru (Staging)" },
  { value: "item", label: "Jasa" },
  { value: "kategori", label: "Kategori" },
  { value: "server", label: "Server" },
  { value: "cpanel", label: "Akun cPanel" },
  { value: "vendor", label: "Vendor" },
  { value: "cloud-type", label: "Jenis Cloud" },
  { value: "hosting-package", label: "Paket Hosting" },
] as const;

export const MasterDataPanel: React.FC<{
  domains: DomainRow[];
  recurringBills: RecurringBillRow[];
  clients: ClientRow[];
  legacySalesClients: LegacySalesClientRow[];
  items: ItemRow[];
  vendors: VendorRow[];
  cloudTypes: LookupRow[];
  hostingPackages: LookupRow[];
  servers: ServerRow[];
  cpanelAccounts: CpanelAccountRow[];
}> = ({ domains, recurringBills, clients, legacySalesClients, items, vendors, cloudTypes, hostingPackages, servers, cpanelAccounts }) => {
  const [tab, setTabState] = useState<(typeof MASTER_TABS)[number]["value"]>("domain");

  useEffect(() => {
    const saved = window.localStorage.getItem("masterdata:tab");
    if (saved && MASTER_TABS.some((t) => t.value === saved)) {
      setTabState(saved as (typeof MASTER_TABS)[number]["value"]);
    }
  }, []);

  const setTab = (value: (typeof MASTER_TABS)[number]["value"]) => {
    setTabState(value);
    window.localStorage.setItem("masterdata:tab", value);
  };

  return (
    <div className="space-y-5">
      <div className="p-1 rounded-2xl bg-white/90 border border-slate-200/90 shadow-2xs flex items-center gap-1 flex-wrap w-fit">
        {MASTER_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === t.value ? "bg-[#0544cc] text-white shadow-md shadow-blue-700/20" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "domain" && <DomainSection rows={domains} />}
      {tab === "recurring-bill" && <BiayaBerkalaSection rows={recurringBills} vendors={vendors} />}
      {tab === "client" && <ClientSection rows={clients} />}
      {tab === "legacy-client" && <LegacyClientStagingSection rows={legacySalesClients} />}
      {tab === "item" && <ItemSection rows={items} />}
      {tab === "kategori" && <CategorySection />}
      {tab === "server" && <ServerSection rows={servers} vendors={vendors} cloudTypes={cloudTypes} />}
      {tab === "cpanel" && <CpanelAccountSection rows={cpanelAccounts} cloudTypes={cloudTypes} packages={hostingPackages} />}
      {tab === "vendor" && <VendorSection rows={vendors} />}
      {tab === "cloud-type" && <LookupSection title="Jenis Cloud" endpoint="/api/cloud-types" rows={cloudTypes} />}
      {tab === "hosting-package" && <LookupSection title="Paket Hosting" endpoint="/api/hosting-packages" rows={hostingPackages} />}
    </div>
  );
};
