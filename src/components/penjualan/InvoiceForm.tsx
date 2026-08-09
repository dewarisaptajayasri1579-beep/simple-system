"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, CardTitle, CardDescription, Input, Select, Modal, Alert, CurrencyInput } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
import { jakartaTodayDateIso, shiftJakartaDateIso } from "@/lib/datetime";

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
  const [isSavingClient, setIsSavingClient] = useState(false);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    fetch("/api/items").then((r) => r.json()).then(setItems);
    fetch("/api/settings").then((r) => r.json()).then((s) => setPpnRate(s.defaultPpnRate ?? 11));
  }, []);

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
  const ppnAmount = ppnEnabled ? Math.round(afterDiscount * (ppnRate / 100)) : 0;
  const totalAmount = afterDiscount + ppnAmount;

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    setIsSavingClient(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName, phoneNumber: newClientPhone }),
      });
      const created = await res.json();
      setClients((prev) => [...prev, created]);
      setClientId(created.id);
      setIsNewClientOpen(false);
      setNewClientName("");
      setNewClientPhone("");
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
          discountAmount,
          lines,
          domainId: prefill?.domainId,
          serverId: prefill?.serverId,
          maintenanceId: prefill?.maintenanceId,
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
            <div className="flex justify-between text-slate-600">
              <span>PPN {ppnRate}%</span>
              <span>{formatRupiah(ppnAmount)}</span>
            </div>
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

      <Modal isOpen={isNewClientOpen} onClose={() => setIsNewClientOpen(false)} title="Client Baru">
        <div className="space-y-4">
          <Input label="Nama Client" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} />
          <Input label="No. HP (opsional)" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} />
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
