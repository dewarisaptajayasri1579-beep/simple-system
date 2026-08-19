"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Select,
  Input,
  Alert,
  FilterableTable,
  CurrencyInput,
  type FilterableColumn,
} from "@/components/ui";
import { jakartaTodayDateIso } from "@/lib/datetime";

export interface ClientOption {
  id: string;
  name: string;
  isPemungutPpn: boolean;
}

interface AccountOption {
  id: string;
  name: string;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  dueDate: string | null;
  remaining: number;
  ppnAmount: number;
  // PPN invoice ini disetor client langsung ke negara (client Pemungut PPN) — sisa tagih &
  // porsi PPN yang ditampilkan/dikirim ke backend jadi 0, cuma DPP yang benar-benar ditagih.
  isPemungutInvoice: boolean;
}

interface DomainOption {
  id: string;
  name: string;
  sellPrice: number | null;
}

interface ServerOption {
  id: string;
  name: string;
  price: number | null;
}

type CostMode = "none" | "manual" | "domain" | "server";

interface LineState {
  checked: boolean;
  amount: number;
  costMode: CostMode;
  costAmount: number;
  costLinkId: string;
  // Kosong = pakai akun yang sama dengan "Masuk ke Akun" di atas (default lama) — diisi kalau
  // Biaya (HPP) Bayar Domain/Server ini mau dikeluarkan dari kas/bank yang beda.
  costAccountId: string;
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export const PembayaranForm: React.FC<{
  clients: ClientOption[];
  userRole: string;
  prefillClientId?: string;
  prefillInvoiceId?: string;
}> = ({ clients, userRole, prefillClientId, prefillInvoiceId }) => {
  const router = useRouter();
  const isOwner = userRole === "owner";
  const [clientId, setClientId] = useState(prefillClientId ?? "");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState("");
  const [paidAt, setPaidAt] = useState(jakartaTodayDateIso());
  const [notes, setNotes] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settlePpn, setSettlePpn] = useState(false);
  const [ppnSettlementAccountId, setPpnSettlementAccountId] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data: AccountOption[]) => {
        setAccounts(data);
        setAccountId((prev) => prev || data[0]?.id || "");
      });
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/servers")
      .then((r) => r.json())
      .then((data: Array<{ id: string; name: string; price: number | null }>) =>
        setServers(Array.isArray(data) ? data.filter((s) => (s.price ?? 0) > 0) : [])
      )
      .catch(() => {});
  }, [isOwner]);

  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId]);

  useEffect(() => {
    if (!clientId) {
      setInvoices([]);
      setLines({});
      setDomains([]);
      return;
    }
    setIsLoadingInvoices(true);
    fetch(`/api/invoices?clientId=${clientId}&postStatus=posted`)
      .then((r) => r.json())
      .then(
        (
          data: Array<{
            id: string;
            invoiceNumber: string;
            totalAmount: number;
            ppnAmount: number;
            ppnEnabled: boolean;
            dueDate: string | null;
            payments: { amount: number }[];
            costLinkType: "domain" | "server" | null;
            costLinkId: string | null;
          }>
        ) => {
          const rows: InvoiceRow[] = data
            .map((inv) => {
              const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
              // Client Pemungut PPN: PPN invoice ini tidak pernah masuk kas kita, jadi yang
              // ditagih/dianggap sisa cuma DPP-nya (sama rumus dengan invoiceCashDue backend).
              const isPemungutInvoice = Boolean(selectedClient?.isPemungutPpn) && inv.ppnEnabled;
              const cashDue = isPemungutInvoice ? inv.totalAmount - inv.ppnAmount : inv.totalAmount;
              return {
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                totalAmount: inv.totalAmount,
                ppnAmount: inv.ppnAmount,
                dueDate: inv.dueDate,
                remaining: Math.max(0, cashDue - paid),
                isPemungutInvoice,
              };
            })
            .filter((r) => r.remaining > 0.5);
          setInvoices(rows);
          setLines(
            Object.fromEntries(
              rows.map((r) => {
                // Invoice yang dibuat dari "Tagih Sekarang" bawa costLinkType/costLinkId sendiri —
                // langsung pilihkan Bayar Domain/Server-nya, staf tidak perlu pilih manual lagi
                // (nominal HPP tetap wajib diisi manual, itu bukan harga jual).
                const source = data.find((d) => d.id === r.id);
                // costLinkType bisa juga "maintenance" (lihat BillingFollowUp/sop.txt) — form ini
                // belum punya UI "Bayar Maintenance", jadi auto-select cuma buat domain/server;
                // selain itu jatuh ke "none" (staf isi manual) supaya tidak macet costMode
                // ke-set ke nilai yang tidak ada input UI-nya.
                const autoLink =
                  isOwner && source?.costLinkId && (source.costLinkType === "domain" || source.costLinkType === "server");
                return [
                  r.id,
                  {
                    checked: r.id === prefillInvoiceId,
                    amount: r.remaining,
                    costMode: (autoLink ? source!.costLinkType : "none") as CostMode,
                    costAmount: 0,
                    costLinkId: autoLink ? source!.costLinkId! : "",
                    costAccountId: "",
                  },
                ];
              })
            )
          );
        }
      )
      .finally(() => setIsLoadingInvoices(false));

    if (isOwner) {
      fetch(`/api/domains?clientId=${clientId}`)
        .then((r) => r.json())
        .then((data: Array<{ id: string; name: string; sellPrice: number | null }>) =>
          setDomains(Array.isArray(data) ? data.filter((d) => (d.sellPrice ?? 0) > 0) : [])
        )
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const clientOptions = useMemo(() => clients.map((c) => ({ value: c.id, label: c.name })), [clients]);
  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);
  const domainOptions = useMemo(() => domains.map((d) => ({ value: d.id, label: `${d.name} · ${formatRupiah(d.sellPrice ?? 0)}` })), [domains]);
  const serverOptions = useMemo(() => servers.map((s) => ({ value: s.id, label: `${s.name} · ${formatRupiah(s.price ?? 0)}` })), [servers]);

  const costModeOptions = useMemo(() => {
    const base = [
      { value: "none", label: "Tanpa biaya" },
      { value: "manual", label: "Biaya manual" },
    ];
    if (isOwner) {
      base.push({ value: "domain", label: "Bayar Domain" }, { value: "server", label: "Bayar Server" });
    }
    return base;
  }, [isOwner]);

  const updateLine = (id: string, patch: Partial<LineState>) =>
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const totalDibayar = Object.values(lines).reduce((sum, l) => sum + (l.checked ? l.amount : 0), 0);
  // Total PPN dari semua invoice yang dicentang, proporsional terhadap jumlah yang dibayar —
  // rumus sama persis dengan ppnPortion di app/api/payments/route.ts supaya konsisten.
  const totalPpnPortion = invoices.reduce((sum, inv) => {
    const line = lines[inv.id];
    if (!line?.checked || inv.isPemungutInvoice || inv.ppnAmount <= 0 || inv.totalAmount <= 0) return sum;
    return sum + Math.round((inv.ppnAmount * line.amount) / inv.totalAmount);
  }, 0);

  const columns: FilterableColumn<InvoiceRow>[] = [
    { key: "no", header: "#", cell: (_row, i) => i + 1, headClassName: "w-10", cellClassName: "text-slate-400" },
    {
      key: "check",
      header: "",
      headClassName: "w-10",
      cell: (inv) => (
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={lines[inv.id]?.checked ?? false}
          onChange={(e) => updateLine(inv.id, { checked: e.target.checked })}
        />
      ),
    },
    {
      key: "invoiceNumber",
      header: "No. Invoice",
      filterValue: (inv) => inv.invoiceNumber,
      cellClassName: "font-semibold",
      cell: (inv) => (
        <Link href={`/penjualan/${inv.id}`} target="_blank" className="hover:underline">
          {inv.invoiceNumber}
        </Link>
      ),
    },
    { key: "dueDate", header: "Jatuh Tempo", cell: (inv) => formatDate(inv.dueDate) },
    { key: "totalAmount", header: "Total", cell: (inv) => formatRupiah(inv.totalAmount) },
    {
      key: "ppnAmount",
      header: "PPN",
      cell: (inv) =>
        inv.ppnAmount <= 0 ? "-" : inv.isPemungutInvoice ? (
          <span className="text-slate-400" title="Disetor client (Pemungut PPN), bukan ke kas kita">
            {formatRupiah(inv.ppnAmount)} (dipungut client)
          </span>
        ) : (
          formatRupiah(inv.ppnAmount)
        ),
    },
    { key: "remaining", header: "Sisa", cellClassName: "font-semibold", cell: (inv) => formatRupiah(inv.remaining) },
    {
      key: "amount",
      header: "Jumlah Dibayar",
      headClassName: "min-w-[10rem]",
      cell: (inv) => {
        const line = lines[inv.id];
        // PPN proporsional terhadap porsi yang dibayar sekarang — sama persis rumus yang dipakai
        // backend (lihat ppnPortion di app/api/payments/route.ts) supaya angka yang staf lihat di
        // sini konsisten dengan yang benar-benar kejurnal sebagai "PPN Keluaran".
        const ppnPortion =
          !inv.isPemungutInvoice && inv.ppnAmount > 0 && inv.totalAmount > 0
            ? Math.round((inv.ppnAmount * (line?.amount ?? 0)) / inv.totalAmount)
            : 0;
        return (
          <div className="space-y-0.5">
            <CurrencyInput sizeVariant="sm" value={line?.amount ?? 0} disabled={!line?.checked} onChange={(v) => updateLine(inv.id, { amount: v })} />
            {line?.checked && ppnPortion > 0 && <p className="text-xs text-slate-400">termasuk PPN {formatRupiah(ppnPortion)}</p>}
          </div>
        );
      },
    },
    {
      key: "cost",
      header: "Biaya",
      headClassName: "min-w-[13rem]",
      cell: (inv) => {
        const line = lines[inv.id];
        const disabled = !line?.checked;
        return (
          <div className="space-y-1.5 min-w-[12rem]">
            <Select
              sizeVariant="sm"
              options={costModeOptions}
              value={line?.costMode ?? "none"}
              disabled={disabled}
              onChange={(v) => updateLine(inv.id, { costMode: v as CostMode, costAmount: 0, costLinkId: "", costAccountId: "" })}
              searchable={false}
            />
            {line?.costMode === "manual" && (
              <CurrencyInput sizeVariant="sm" value={line.costAmount} disabled={disabled} onChange={(v) => updateLine(inv.id, { costAmount: v })} />
            )}
            {line?.costMode === "domain" && (
              <>
                <Select
                  sizeVariant="sm"
                  options={domainOptions}
                  value={line.costLinkId}
                  disabled={disabled}
                  onChange={(v) => updateLine(inv.id, { costLinkId: v })}
                  placeholder="Pilih domain"
                  emptyText="Client ini belum punya domain berharga"
                />
                <CurrencyInput
                  sizeVariant="sm"
                  value={line.costAmount}
                  disabled={disabled}
                  placeholder="Biaya (HPP), bukan harga jual"
                  onChange={(v) => updateLine(inv.id, { costAmount: v })}
                />
                <Select
                  sizeVariant="sm"
                  options={accountOptions}
                  value={line.costAccountId}
                  disabled={disabled}
                  onChange={(v) => updateLine(inv.id, { costAccountId: v })}
                  placeholder="Bayar dari akun yang sama"
                />
              </>
            )}
            {line?.costMode === "server" && (
              <>
                <Select
                  sizeVariant="sm"
                  options={serverOptions}
                  value={line.costLinkId}
                  disabled={disabled}
                  onChange={(v) => updateLine(inv.id, { costLinkId: v })}
                  placeholder="Pilih server"
                />
                <CurrencyInput
                  sizeVariant="sm"
                  value={line.costAmount}
                  disabled={disabled}
                  placeholder="Biaya (HPP), bukan harga jual"
                  onChange={(v) => updateLine(inv.id, { costAmount: v })}
                />
                <Select
                  sizeVariant="sm"
                  options={accountOptions}
                  value={line.costAccountId}
                  disabled={disabled}
                  onChange={(v) => updateLine(inv.id, { costAccountId: v })}
                  placeholder="Bayar dari akun yang sama"
                />
              </>
            )}
          </div>
        );
      },
    },
  ];

  const handleClientChange = (value: string) => {
    setClientId(value);
    router.replace(value ? `/pembayaran?clientId=${value}` : "/pembayaran");
  };

  const handleSubmit = async () => {
    setError("");
    if (!clientId) {
      setError("Pilih client dulu");
      return;
    }
    if (!accountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    const selected = Object.entries(lines).filter(([, l]) => l.checked && l.amount > 0);
    if (selected.length === 0) {
      setError("Centang minimal 1 invoice & isi jumlah dibayar");
      return;
    }
    const missingLink = selected.find(([, l]) => (l.costMode === "domain" || l.costMode === "server") && !l.costLinkId);
    if (missingLink) {
      setError("Ada baris biaya yang belum pilih domain/server-nya");
      return;
    }
    const missingCost = selected.find(([, l]) => l.costMode !== "none" && (!l.costAmount || l.costAmount <= 0));
    if (missingCost) {
      setError("Ada baris biaya yang belum diisi nominal HPP-nya");
      return;
    }
    if (settlePpn && !ppnSettlementAccountId) {
      setError("Pilih dulu akun kas/bank untuk setor PPN-nya");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          accountId,
          paidAt,
          notes,
          ppnSettlementAccountId: settlePpn ? ppnSettlementAccountId : undefined,
          lines: selected.map(([invoiceId, l]) => ({
            invoiceId,
            amount: l.amount,
            costAmount: l.costMode === "none" ? 0 : l.costAmount,
            costLink:
              l.costMode === "domain" || l.costMode === "server"
                ? { type: l.costMode, id: l.costLinkId, accountId: l.costAccountId || undefined }
                : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan pembayaran");
        setIsSubmitting(false);
        return;
      }
      router.push(`/pembayaran/${data.id}`);
    } catch {
      setError("Gagal menghubungi server");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="lg">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="Client" options={clientOptions} value={clientId} onChange={handleClientChange} placeholder="Pilih client" />
          <Select label="Masuk ke Akun" options={accountOptions} value={accountId} onChange={setAccountId} placeholder="Pilih Kas/Bank" />
          <Input label="Tanggal Pembayaran" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
      </Card>

      {clientId && (
        <Card variant="panel" padding="none">
          <div className="p-5 sm:p-6">
            <CardTitle>Invoice Belum Lunas</CardTitle>
            <CardDescription>
              Centang invoice yang mau dibayar, sesuaikan nominal kalau dicicil sebagian.
              {isOwner && " Biaya bisa dikaitkan ke Bayar Domain/Server supaya otomatis kecatat lunas di sana juga."}
            </CardDescription>
          </div>
          <FilterableTable
            columns={columns}
            rows={invoices}
            rowKey={(inv) => inv.id}
            searchPlaceholder="Cari no. invoice..."
            emptyMessage={isLoadingInvoices ? "Memuat invoice..." : "Semua invoice client ini sudah lunas."}
          />
        </Card>
      )}

      {clientId && invoices.length > 0 && (
        <Card variant="panel" padding="lg">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
            <div className="flex-1">
              <Input label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-bold text-slate-500 uppercase">Total Dibayar</p>
              <p className="text-xl font-black text-emerald-700">{formatRupiah(totalDibayar)}</p>
            </div>
          </div>

          {isOwner && totalPpnPortion > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" className="w-4 h-4" checked={settlePpn} onChange={(e) => setSettlePpn(e.target.checked)} />
                Setor PPN sekaligus ({formatRupiah(totalPpnPortion)})
              </label>
              {settlePpn && (
                <div className="flex-1 max-w-xs">
                  <Select
                    sizeVariant="sm"
                    options={accountOptions}
                    value={ppnSettlementAccountId}
                    onChange={setPpnSettlementAccountId}
                    placeholder="Pilih akun kas/bank untuk setor PPN"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting} disabled={totalDibayar <= 0}>
              Simpan Pembayaran
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
