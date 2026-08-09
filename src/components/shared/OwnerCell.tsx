"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Select, Input, Alert, Button } from "@/components/ui";

interface ClientOption {
  id: string;
  name: string;
}

interface StagingClient {
  id: string;
  name: string;
  client: { id: string } | null;
}

// Internal (7Smarts, jadi Biaya) vs Client (ditagihkan, jadi Pendapatan - HPP).
const OwnerToggle: React.FC<{ isExternal: boolean; onToggle: () => void; disabled?: boolean }> = ({ isExternal, onToggle, disabled }) => (
  <div className="flex items-center gap-2">
    <span className={`text-[11px] font-bold ${!isExternal ? "text-slate-700" : "text-slate-400"}`}>Internal</span>
    <button
      type="button"
      role="switch"
      aria-checked={isExternal}
      aria-label={isExternal ? "Tandai sebagai Internal (7Smarts)" : "Tandai sebagai milik Client"}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        isExternal ? "bg-[#0544cc]" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          isExternal ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
    <span className={`text-[11px] font-bold ${isExternal ? "text-[#0544cc]" : "text-slate-400"}`}>Client</span>
  </div>
);

export interface OwnerCellProps {
  /** API endpoint yang menerima PATCH { clientId } dan membalas objek berisi clientId & client.name */
  apiPath: string;
  itemName: string;
  clientId: string | null;
  clients: ClientOption[];
  onUpdated: (patch: { clientId: string | null; clientName: string | null }) => void;
}

export const OwnerCell: React.FC<OwnerCellProps> = ({ apiPath, itemName, clientId, clients, onUpdated }) => {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [localClients, setLocalClients] = useState(clients);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [error, setError] = useState("");
  const [stagingClients, setStagingClients] = useState<StagingClient[]>([]);

  useEffect(() => setLocalClients(clients), [clients]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/legacy-sales-clients")
      .then((r) => r.json())
      .then(setStagingClients)
      .catch(() => {});
  }, [open]);

  const stagingOptions = useMemo(
    () =>
      stagingClients
        .filter((s) => !s.client)
        .map((s) => ({ value: `staging:${s.id}`, label: `${s.name} (Pelanggan Baru — Staging)` })),
    [stagingClients]
  );

  const clientOptions = useMemo(
    () => [...localClients.map((c) => ({ value: c.id, label: c.name })), ...stagingOptions],
    [localClients, stagingOptions]
  );

  const patchClient = async (targetClientId: string) => {
    setSaving(true);
    const res = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: targetClientId }),
    });
    if (res.ok) {
      const data = await res.json();
      onUpdated({ clientId: data.clientId ?? null, clientName: data.client?.name ?? null });
      router.refresh();
    }
    setSaving(false);
  };

  const handleToggle = () => {
    if (clientId) {
      patchClient("");
    } else {
      setSelectedClientId(localClients[0]?.id ?? "");
      setShowNewClient(false);
      setError("");
      setOpen(true);
    }
  };

  const openNewClientForm = (prefill: string) => {
    setNewName(prefill);
    setNewPhone("");
    setError("");
    setShowNewClient(true);
  };

  const handleCreateClient = async () => {
    if (!newName.trim()) {
      setError("Nama client wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), phoneNumber: newPhone.trim() || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menambah client");
      return;
    }
    setLocalClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedClientId(data.id);
    setShowNewClient(false);
  };

  const handleConfirm = async () => {
    if (!selectedClientId) return;
    let targetClientId = selectedClientId;

    if (selectedClientId.startsWith("staging:")) {
      const stagingId = selectedClientId.slice("staging:".length);
      setSaving(true);
      setError("");
      const res = await fetch(`/api/legacy-sales-clients/${stagingId}/promote`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSaving(false);
        setError(data.error || "Gagal mempromosikan Pelanggan Baru (Staging) ini");
        return;
      }
      targetClientId = data.id;
      setLocalClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setStagingClients((prev) => prev.map((s) => (s.id === stagingId ? { ...s, client: { id: data.id } } : s)));
    }

    await patchClient(targetClientId);
    setOpen(false);
  };

  return (
    <>
      <OwnerToggle isExternal={!!clientId} disabled={saving} onToggle={handleToggle} />
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={showNewClient ? "Tambah Client Baru" : "Pilih Client"}
        subtitle={
          showNewClient ? `Client baru untuk "${itemName}"` : `Tandai "${itemName}" sebagai milik client mana?`
        }
        footer={
          showNewClient ? (
            <>
              <Button variant="outline" onClick={() => setShowNewClient(false)}>
                Kembali
              </Button>
              <Button onClick={handleCreateClient} disabled={saving || !newName.trim()}>
                {saving ? "Menyimpan..." : "Simpan Client"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button onClick={handleConfirm} disabled={!selectedClientId || saving}>
                Simpan
              </Button>
            </>
          )
        }
      >
        {showNewClient ? (
          <div className="space-y-4">
            {error && <Alert variant="error">{error}</Alert>}
            <Input label="Nama Client" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input label="No. WA" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="08xxxxxxxxxx" />
          </div>
        ) : (
          <div className="space-y-3">
            {error && <Alert variant="error">{error}</Alert>}
            <Select
              label="Client"
              value={selectedClientId}
              onChange={setSelectedClientId}
              options={clientOptions}
              searchable
              creatable
              deferCreate
              createOptionLabel={(q) => `+ Tambah client baru "${q}"`}
              onCreateOption={(q) => openNewClientForm(q)}
            />
            <button
              type="button"
              onClick={() => openNewClientForm("")}
              className="text-xs font-bold text-[#0544cc] hover:underline cursor-pointer"
            >
              Client belum ada di daftar? Tambah baru
            </button>
          </div>
        )}
      </Modal>
    </>
  );
};
