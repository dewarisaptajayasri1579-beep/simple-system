"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, Modal, Input, CurrencyInput, Button, Alert } from "@/components/ui";

export interface AccountOption {
  id: string;
  name: string;
}

const BANK_KEYWORDS = ["mandiri", "bca", "bri", "bni", "bsi"];

function detectAccountType(name: string): "kas" | "bank" {
  const lower = name.trim().toLowerCase();
  if (!lower) return "kas";
  if (lower.startsWith("bank")) return "bank";
  return BANK_KEYWORDS.some((k) => lower.includes(k)) ? "bank" : "kas";
}

/** Select akun Kas/Bank yang bisa langsung menambah akun baru inline (dipakai di semua form
 *  yang butuh pilih akun — Bayar Domain/Server, Kas Masuk/Keluar) — supaya alur "akun belum
 *  ada" tidak perlu keluar dulu ke halaman Keuangan. */
export const AccountPicker: React.FC<{
  label?: string;
  accounts: AccountOption[];
  value: string;
  onChange: (id: string) => void;
  onAccountCreated?: (account: AccountOption) => void;
}> = ({ label = "Akun", accounts, value, onChange, onAccountCreated }) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"kas" | "bank">("kas");
  const [bankName, setBankName] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openModal = (prefill: string) => {
    setName(prefill);
    setType(detectAccountType(prefill));
    setBankName("");
    setOpeningBalance(0);
    setError("");
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Nama akun wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type, bankName, openingBalance }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan akun");
      return;
    }
    onChange(data.id);
    onAccountCreated?.({ id: data.id, name: data.name });
    setIsOpen(false);
    router.refresh();
  };

  return (
    <>
      <Select
        label={label}
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={value}
        onChange={onChange}
        placeholder="Pilih Kas/Bank"
        searchPlaceholder="Cari atau ketik untuk tambah..."
        emptyText="Belum ada, ketik untuk menambah"
        creatable
        deferCreate
        onCreateOption={openModal}
        createOptionLabel={(q) => `Tambah akun "${q}"`}
      />
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Akun Kas/Bank Baru">
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Input
            label="Nama Akun"
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              if (detectAccountType(v) === "bank") setType("bank");
            }}
            placeholder="mis. BCA Utama"
          />
          <Select
            label="Jenis"
            options={[{ value: "kas", label: "Kas" }, { value: "bank", label: "Bank" }]}
            value={type}
            onChange={(v) => setType(v as "kas" | "bank")}
          />
          {type === "bank" && <Input label="Nama Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />}
          <CurrencyInput label="Saldo Awal" value={openingBalance} onChange={setOpeningBalance} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={saving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
