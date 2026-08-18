"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, CardTitle, CardDescription, Input, Select, Modal, Alert, CurrencyInput } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
import { jakartaTodayDateIso } from "@/lib/datetime";

interface ClientOption {
  id: string;
  name: string;
  picName: string | null;
  picPhone: string | null;
  phoneNumber: string | null;
}

interface ScheduleDraft {
  label: string;
  dueDate: string;
  amount: number;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

const emptySchedule = (): ScheduleDraft => ({ label: "", dueDate: "", amount: 0 });

export const ProjectForm: React.FC = () => {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [picName, setPicName] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [startDate, setStartDate] = useState(jakartaTodayDateIso());
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([{ ...emptySchedule(), label: "DP" }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [isSavingClient, setIsSavingClient] = useState(false);

  useEffect(() => {
    fetch("/api/clients").then((r) => r.json()).then(setClients);
  }, []);

  const clientOptions = useMemo(() => clients.map((c) => ({ value: c.id, label: c.name })), [clients]);

  // Pilih client -> auto-isi PIC Proyek & WA PIC dari master data client, biar gak input dobel.
  // Tetap bisa diubah manual setelahnya kalau PIC proyeknya beda dari PIC client.
  const handleClientChange = (value: string) => {
    setClientId(value);
    const client = clients.find((c) => c.id === value);
    if (client) {
      setPicName(client.picName ?? "");
      setPicPhone(client.picPhone || client.phoneNumber || "");
    }
  };

  const updateSchedule = (index: number, patch: Partial<ScheduleDraft>) => {
    setSchedules((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSchedule = () => setSchedules((prev) => [...prev, { ...emptySchedule(), label: `Termin ${prev.length}` }]);
  const removeSchedule = (index: number) => setSchedules((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const totalValue = schedules.reduce((sum, s) => sum + s.amount, 0);

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
      setPicName(created.picName ?? "");
      setPicPhone(created.picPhone || created.phoneNumber || "");
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
    if (!name.trim()) {
      setError("Nama proyek wajib diisi");
      return;
    }
    if (schedules.some((s) => !s.label.trim() || !s.dueDate || s.amount <= 0)) {
      setError("Tiap baris jadwal pembayaran wajib ada label, tanggal penagihan, dan nominal");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, name, picName, picPhone, startDate, endDate: endDate || null, notes, schedules }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat proyek");
        setIsSubmitting(false);
        return;
      }
      router.push(`/proyek/${data.id}`);
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
        <CardHeader>
          <CardTitle>Info Proyek</CardTitle>
          <CardDescription>Client, nama proyek, periode, dan PIC.</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select label="Client" options={clientOptions} value={clientId} onChange={handleClientChange} placeholder="Pilih client" />
            </div>
            <Button type="button" variant="outline" size="md" onClick={() => setIsNewClientOpen(true)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <Input label="Nama Proyek" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Tanggal Mulai" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="Tanggal Selesai (opsional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Input label="PIC Proyek" value={picName} onChange={(e) => setPicName(e.target.value)} />
          <Input label="No. WA PIC" value={picPhone} onChange={(e) => setPicPhone(e.target.value)} />
        </div>
        <div className="mt-4">
          <Input label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>

      <Card variant="panel" padding="lg">
        <CardHeader>
          <CardTitle>Jadwal Pembayaran</CardTitle>
          <CardDescription>DP, Termin 1, dst. Invoice tiap termin auto-generate 3 hari sebelum tanggal penagihan.</CardDescription>
        </CardHeader>
        <div className="space-y-4">
          {schedules.map((s, index) => (
            <div key={index} className="p-4 rounded-2xl bg-white/60 border border-slate-200/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Baris {index + 1}</span>
                <button type="button" onClick={() => removeSchedule(index)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input label="Label" placeholder="DP / Termin 1 / dst" value={s.label} onChange={(e) => updateSchedule(index, { label: e.target.value })} />
                <Input label="Tanggal Penagihan" type="date" value={s.dueDate} onChange={(e) => updateSchedule(index, { dueDate: e.target.value })} />
                <CurrencyInput label="Nominal Tagih" value={s.amount} onChange={(v) => updateSchedule(index, { amount: v })} />
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addSchedule} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Termin
          </Button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200/60 flex justify-between text-lg font-black text-slate-900">
          <span>Nilai Total Proyek</span>
          <span>{formatRupiah(totalValue)}</span>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => router.back()}>
          Batal
        </Button>
        <Button variant="primary" onClick={handleSubmit} isLoading={isSubmitting}>
          Simpan Proyek
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
