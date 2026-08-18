"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, CardTitle, CardDescription, Input, Select, Modal, Alert, CurrencyInput } from "@/components/ui";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { jakartaTodayDateIso, shiftJakartaDateIso } from "@/lib/datetime";

interface PendingBillingItem {
  id: string;
  type: "domain" | "server" | "maintenance";
  name: string;
  price: number;
  dueDate: string | null;
}

const PENDING_TYPE_LABEL: Record<PendingBillingItem["type"], string> = { domain: "Domain", server: "Server", maintenance: "Maintenance" };

function formatDueDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

interface ClientOption {
  id: string;
  name: string;
}

interface ItemOption {
  id: string;
  name: string;
  type: string;
  defaultPrice: number;
  defaultCost: number;
  unit: string | null;
}

interface LineDraft {
  itemId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
  discountAmount: number;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

const emptyLine = (): LineDraft => ({ itemId: null, description: "", qty: 1, unitPrice: 0, unitCost: 0, discountAmount: 0 });

export interface InvoiceFormPrefill {
  clientId?: string;
  description?: string;
  amount?: number;
  /** Kalau invoice ini dibuat dari "Tagih Sekarang" (Dashboard Domain/Server/Maintenance) —
   *  dikirim balik saat submit supaya form Pembayaran nanti bisa otomatis pilih "Bayar
   *  Domain/Server" (Maintenance belum, lihat PembayaranForm.tsx) tanpa staf pilih manual, dan
   *  supaya BillingFollowUp (SLA tindak-lanjut tagihan) bisa dikaitkan balik ke item asalnya. */
  domainId?: string;
  serverId?: string;
  maintenanceId?: string;
}

export const InvoiceForm: React.FC<{ prefill?: InvoiceFormPrefill }> = ({ prefill }) => {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [clientId, setClientId] = useState(prefill?.clientId ?? "");
  const [issuedAt, setIssuedAt] = useState(jakartaTodayDateIso());
  // Default jatuh tempo 7 hari dari tanggal invoice — tetap boleh diubah manual, dan kalau
  // sudah diubah manual, tidak lagi ikut geser otomatis pas Tanggal Invoice diganti.
  const [dueDate, setDueDate] = useState(shiftJakartaDateIso(jakartaTodayDateIso(), 7));
  const [dueDateTouched, setDueDateTouched] = useState(false);

  useEffect(() => {
    if (dueDateTouched) return;
    setDueDate(shiftJakartaDateIso(issuedAt, 7));
  }, [issuedAt, dueDateTouched]);
  const [notes, setNotes] = useState("");
  const [ppnEnabled, setPpnEnabled] = useState(false);
  const [ppnRate, setPpnRate] = useState(11);
  // "Exclude PPN" — nominal yang diketik di baris item SUDAH termasuk PPN (mis. Nilai Pekerjaan
  // kontrak 8,8jt include PPN 11%), jadi PPN-nya di-BREAKDOWN dari situ (DPP = total/1,11), BUKAN
  // ditambahkan lagi di atas. Beda dari mode default (PPN ditambahkan di atas harga yang diketik).
  const [ppnInclusive, setPpnInclusive] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [lines, setLines] = useState<LineDraft[]>([
    prefill?.description || prefill?.amount
      ? { ...emptyLine(), description: prefill.description ?? "", unitPrice: prefill.amount ?? 0 }
      : emptyLine(),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientCity, setNewClientCity] = useState("");
  const [newClientPicName, setNewClientPicName] = useState("");
  const [newClientPicPhone, setNewClientPicPhone] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newClientNotes, setNewClientNotes] = useState("");
  const [newClientIsPemungutPpn, setNewClientIsPemungutPpn] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);

  // Domain/Server/Maintenance client ini yang lagi jatuh tempo & belum pernah ditagih — bisa
  // langsung "dipanggil" jadi baris invoice di sini, tanpa staf harus bolak-balik ke Dashboard
  // buat klik "Tagih Sekarang" satu-satu (lihat GET /api/clients/[id]/pending-billing).
  const [pendingItems, setPendingItems] = useState<{ domains: PendingBillingItem[]; servers: PendingBillingItem[]; maintenances: PendingBillingItem[] }>({
    domains: [],
    servers: [],
    maintenances: [],
  });
  const [addedPendingKeys, setAddedPendingKeys] = useState<Set<string>>(new Set());
  // "Tampilkan semua" — lepas filter jatuh tempo (lihat ?all=true di pending-billing route),
  // buat kasus staf mau nagih lebih awal padahal Domain/Server/Maintenance-nya belum due.
  const [showAllPending, setShowAllPending] = useState(false);
  // Cuma 1 item yang bisa "ditautkan" resmi ke invoice (Invoice.costLinkType/costLinkId, lihat
  // InvoiceFormPrefill) buat convenience auto-pilih "Bayar Domain/Server" pas Pembayaran nanti —
  // kalau staf tambah lebih dari 1 dari daftar ini, cuma yang PERTAMA yang ditautkan; sisanya
  // tetap masuk sebagai baris invoice biasa (staf pilih manual saat catat Biaya di Pembayaran).
  const [linkedItem, setLinkedItem] = useState<{ type: PendingBillingItem["type"]; id: string } | null>(
    prefill?.domainId
      ? { type: "domain", id: prefill.domainId }
      : prefill?.serverId
        ? { type: "server", id: prefill.serverId }
        : prefill?.maintenanceId
          ? { type: "maintenance", id: prefill.maintenanceId }
          : null
  );

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    fetch("/api/items").then((r) => r.json()).then(setItems);
    fetch("/api/settings").then((r) => r.json()).then((s) => setPpnRate(s.defaultPpnRate ?? 11));
  }, []);

  useEffect(() => {
    if (!clientId) {
      setPendingItems({ domains: [], servers: [], maintenances: [] });
      return;
    }
    fetch(`/api/clients/${clientId}/pending-billing${showAllPending ? "?all=true" : ""}`)
      .then((r) => r.json())
      .then(setPendingItems);
  }, [clientId, showAllPending]);

  const addPendingItem = (item: PendingBillingItem) => {
    const key = `${item.type}:${item.id}`;
    if (addedPendingKeys.has(key)) return;
    const typeLabel = item.type === "domain" ? "Perpanjangan domain" : item.type === "server" ? "Perpanjangan server" : "Maintenance";
    setLines((prev) => {
      const newLine: LineDraft = { ...emptyLine(), description: `${typeLabel} ${item.name}`, unitPrice: item.price };
      const isBlankSingleLine = prev.length === 1 && !prev[0].description.trim() && prev[0].unitPrice === 0;
      return isBlankSingleLine ? [newLine] : [...prev, newLine];
    });
    setAddedPendingKeys((prev) => new Set(prev).add(key));
    setLinkedItem((prev) => prev ?? { type: item.type, id: item.id });
  };

  const clientOptions = useMemo(() => clients.map((c) => ({ value: c.id, label: c.name })), [clients]);
  const itemOptions = useMemo(
    () => items.map((i) => ({ value: i.id, label: `${i.name}${i.unit ? ` / ${i.unit}` : ""}` })),
    [items]
  );

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const pickItemForLine = (index: number, itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    updateLine(index, {
      itemId: item.id,
      description: item.name,
      unitPrice: item.defaultPrice,
      unitCost: item.defaultCost,
    });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index: number) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const totalLineDiscount = lines.reduce((sum, l) => sum + l.discountAmount, 0);
  const afterDiscount = Math.max(0, subtotal - totalLineDiscount - discountAmount);
  // Mode "Exclude PPN": afterDiscount SUDAH termasuk PPN, jadi di-breakdown (bukan ditambah lagi
  // di atas) — rumus sama dengan invoiceCashDue/pemungut PPN: PPN = gross * rate/(100+rate).
  const ppnAmount = !ppnEnabled ? 0 : ppnInclusive ? Math.round(afterDiscount * (ppnRate / (100 + ppnRate))) : Math.round(afterDiscount * (ppnRate / 100));
  const totalAmount = ppnInclusive ? afterDiscount : afterDiscount + ppnAmount;
  const dppAmount = totalAmount - ppnAmount;

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    setIsSavingClient(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClientName,
          phoneNumber: newClientPhone,
          email: newClientEmail,
          city: newClientCity,
          picName: newClientPicName,
          picPhone: newClientPicPhone,
          address: newClientAddress,
          notes: newClientNotes,
          isPemungutPpn: newClientIsPemungutPpn,
        }),
      });
      const created = await res.json();
      setClients((prev) => [...prev, created]);
      setClientId(created.id);
      setIsNewClientOpen(false);
      setNewClientName("");
      setNewClientPhone("");
      setNewClientEmail("");
      setNewClientCity("");
      setNewClientPicName("");
      setNewClientPicPhone("");
      setNewClientAddress("");
      setNewClientNotes("");
      setNewClientIsPemungutPpn(false);
    } finally {
      setIsSavingClient(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (!clientId) {
      setError("Pilih client dulu");
      return;
    }
    if (lines.some((l) => !l.description.trim() || l.unitPrice <= 0)) {
      setError("Tiap baris item wajib ada keterangan & harga");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          issuedAt,
          dueDate: dueDate || null,
          notes,
          ppnEnabled,
          ppnRate,
          ppnInclusive,
          discountAmount,
          lines,
          domainId: linkedItem?.type === "domain" ? linkedItem.id : undefined,
          serverId: linkedItem?.type === "server" ? linkedItem.id : undefined,
          maintenanceId: linkedItem?.type === "maintenance" ? linkedItem.id : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || `Gagal membuat invoice (status ${res.status})`);
        setIsSubmitting(false);
        return;
      }
      if (!data?.id) {
        setError("Invoice tersimpan tapi respons server tidak lengkap — cek menu Invoice.");
        setIsSubmitting(false);
        return;
      }
      router.push(`/penjualan/${data.id}`);
    } catch {
      setError("Gagal menghubungi server — cek koneksi internet lalu coba lagi.");
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
        <CardHeader>
          <CardTitle>Info Invoice</CardTitle>
          <CardDescription>Pilih client, tanggal jatuh tempo, dan catatan (opsional).</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select label="Client" options={clientOptions} value={clientId} onChange={setClientId} placeholder="Pilih client" />
            </div>
            <Button type="button" variant="outline" size="md" onClick={() => setIsNewClientOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <Input label="Tanggal Invoice" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
          <Input
            label="Jatuh Tempo"
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setDueDateTouched(true);
            }}
          />
        </div>
        <div className="mt-4">
          <Input label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>

      {clientId && (
        <Card variant="panel" padding="lg">
          <CardHeader>
            <CardTitle>Tagihan Belum Ditagih</CardTitle>
            <CardDescription>
              {showAllPending
                ? "Semua Domain/Server/Maintenance aktif client ini, termasuk yang belum jatuh tempo — klik untuk tambah jadi baris invoice."
                : "Domain/Server/Maintenance client ini yang jatuh tempo & belum pernah ditagih — klik untuk tambah jadi baris invoice."}
            </CardDescription>
          </CardHeader>
          <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4" checked={showAllPending} onChange={(e) => setShowAllPending(e.target.checked)} />
            Tampilkan semua (termasuk yang belum jatuh tempo)
          </label>
          {pendingItems.domains.length === 0 && pendingItems.servers.length === 0 && pendingItems.maintenances.length === 0 ? (
            <p className="text-sm text-slate-500">
              {showAllPending ? "Client ini belum punya Domain/Server/Maintenance aktif." : "Tidak ada yang jatuh tempo saat ini."}
            </p>
          ) : (
          <div className="space-y-2">
            {[...pendingItems.domains, ...pendingItems.servers, ...pendingItems.maintenances].map((item) => {
              const key = `${item.type}:${item.id}`;
              const added = addedPendingKeys.has(key);
              return (
                <div key={key} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/60 border border-slate-200/70">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wide text-[#0544cc] bg-blue-50 px-1.5 py-0.5 rounded">
                        {PENDING_TYPE_LABEL[item.type]}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">{item.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Jatuh tempo {formatDueDate(item.dueDate)} · {formatRupiah(item.price)}
                    </p>
                  </div>
                  <Button type="button" size="sm" variant={added ? "ghost" : "outline"} disabled={added} onClick={() => addPendingItem(item)} leftIcon={<Sparkles className="w-3.5 h-3.5" />}>
                    {added ? "Ditambahkan" : "Tambah"}
                  </Button>
                </div>
              );
            })}
          </div>
          )}
        </Card>
      )}

      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Baris Item / Jasa</CardTitle>
          <CardDescription>Pilih dari katalog atau ketik manual. Mayoritas jasa, diskon per baris opsional.</CardDescription>
        </CardHeader>
        <div className="space-y-4">
          {lines.map((line, index) => (
            <div key={index} className="p-4 rounded-2xl bg-white/60 border border-slate-200/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Baris {index + 1}</span>
                <button type="button" onClick={() => removeLine(index)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Select
                options={itemOptions}
                value={line.itemId ?? ""}
                onChange={(v) => pickItemForLine(index, v)}
                placeholder="Pilih dari katalog (opsional)"
              />
              <Input
                placeholder="Keterangan"
                value={line.description}
                onChange={(e) => updateLine(index, { description: e.target.value })}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Input
                  label="Qty"
                  type="number"
                  sizeVariant="sm"
                  value={line.qty}
                  onChange={(e) => updateLine(index, { qty: Number(e.target.value) || 1 })}
                />
                <CurrencyInput
                  label="Harga Satuan"
                  sizeVariant="sm"
                  value={line.unitPrice}
                  onChange={(v) => updateLine(index, { unitPrice: v })}
                />
                <CurrencyInput
                  label="HPP Satuan"
                  sizeVariant="sm"
                  value={line.unitCost}
                  onChange={(v) => updateLine(index, { unitCost: v })}
                />
                <CurrencyInput
                  label="Diskon"
                  sizeVariant="sm"
                  value={line.discountAmount}
                  onChange={(v) => updateLine(index, { discountAmount: v })}
                />
              </div>
              <p className="text-right text-sm font-bold text-slate-700">
                Subtotal: {formatRupiah(line.qty * line.unitPrice - line.discountAmount)}
              </p>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addLine} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Baris
          </Button>
        </div>
      </Card>

      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Diskon &amp; PPN</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <CurrencyInput label="Diskon Tambahan" value={discountAmount} onChange={setDiscountAmount} />
          <label className="flex items-center gap-2.5 h-14 px-1 cursor-pointer select-none">
            <input type="checkbox" checked={ppnEnabled} onChange={(e) => setPpnEnabled(e.target.checked)} className="w-5 h-5" />
            <span className="font-bold text-sm text-slate-700">Kenakan PPN {ppnRate}%</span>
          </label>
        </div>

        {ppnEnabled && (
          <label className="mt-3 flex items-start gap-3 rounded-lg border border-slate-200 p-3 cursor-pointer select-none">
            <input type="checkbox" className="w-5 h-5 mt-0.5" checked={ppnInclusive} onChange={(e) => setPpnInclusive(e.target.checked)} />
            <span>
              <span className="block text-sm font-semibold text-slate-700">Exclude PPN (harga di atas sudah termasuk PPN)</span>
              <span className="block text-xs text-slate-500">
                Nominal yang diketik di baris item sudah termasuk PPN {ppnRate}% (mis. Nilai Pekerjaan kontrak) — sistem breakdown DPP &amp; PPN dari situ,
                bukan menambahkan PPN baru di atas harga.
              </span>
            </span>
          </label>
        )}

        <div className="mt-6 pt-4 border-t border-slate-200/60 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Diskon</span>
            <span>- {formatRupiah(totalLineDiscount + discountAmount)}</span>
          </div>
          {ppnEnabled && (
            <>
              <div className="flex justify-between text-slate-600">
                <span>DPP</span>
                <span>{formatRupiah(dppAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>PPN {ppnRate}%{ppnInclusive ? " (breakdown)" : ""}</span>
                <span>{formatRupiah(ppnAmount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-lg font-black text-slate-900 pt-2 border-t border-slate-200/60">
            <span>Total</span>
            <span>{formatRupiah(totalAmount)}</span>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => router.back()}>
          Batal
        </Button>
        <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>
          Simpan Invoice
        </Button>
      </div>

      <Modal isOpen={isNewClientOpen} onClose={() => setIsNewClientOpen(false)} title="Client Baru" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nama" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
            <Input label="Email" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} />
            <Input label="No. HP" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} />
            <Input label="Kota" value={newClientCity} onChange={(e) => setNewClientCity(e.target.value)} />
            <Input label="Nama PIC" value={newClientPicName} onChange={(e) => setNewClientPicName(e.target.value)} />
            <Input label="No. HP PIC" value={newClientPicPhone} onChange={(e) => setNewClientPicPhone(e.target.value)} />
          </div>
          <Input label="Alamat" value={newClientAddress} onChange={(e) => setNewClientAddress(e.target.value)} />
          <Input label="Catatan" value={newClientNotes} onChange={(e) => setNewClientNotes(e.target.value)} />
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              className="w-5 h-5 mt-0.5"
              checked={newClientIsPemungutPpn}
              onChange={(e) => setNewClientIsPemungutPpn(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-slate-700">Pemungut PPN (instansi pemerintah)</span>
              <span className="block text-xs text-slate-500">
                PPN pada invoice ke client ini disetor client langsung ke kas negara — tidak pernah masuk kas kita.
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsNewClientOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleCreateClient} isLoading={isSavingClient}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
