"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Input, Select, Alert, CurrencyInput } from "@/components/ui";
import { Plus } from "lucide-react";
import { COA_CODE } from "@/lib/accounting/coa-seed";

interface CoaOption {
  id: string;
  code: string;
  name: string;
  isParent: boolean;
  parent: { code: string } | null;
}

const BANK_KEYWORDS = ["mandiri", "bca", "bri", "bni", "bsi"];

function detectAccountType(name: string): "kas" | "bank" {
  const lower = name.trim().toLowerCase();
  if (!lower) return "kas";
  if (lower.startsWith("bank")) return "bank";
  return BANK_KEYWORDS.some((k) => lower.includes(k)) ? "bank" : "kas";
}

export const AddAccountButton: React.FC = () => {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"kas" | "bank">("kas");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [coaAccountId, setCoaAccountId] = useState("");
  const [coaOptions, setCoaOptions] = useState<CoaOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/coa")
      .then((r) => r.json())
      .then((data: CoaOption[]) => {
        if (Array.isArray(data)) setCoaOptions(data.filter((a) => !a.isParent && a.parent?.code === COA_CODE.kasBankParent));
      })
      .catch(() => {});
  }, []);

  const coaSelectOptions = useMemo(() => coaOptions.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })), [coaOptions]);

  const openModal = () => {
    setName("");
    setType("kas");
    setBankName("");
    setAccountNumber("");
    setOpeningBalance(0);
    setCoaAccountId("");
    setError("");
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, bankName, accountNumber, openingBalance, coaAccountId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Gagal menyimpan akun");
        setIsSaving(false);
        return;
      }
      setIsOpen(false);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openModal}>
        Tambah Akun Kas/Bank
      </Button>

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
              const value = e.target.value;
              setName(value);
              if (detectAccountType(value) === "bank") setType("bank");
            }}
            placeholder="mis. BCA Utama"
          />
          <Select
            label="Jenis"
            options={[
              { value: "kas", label: "Kas" },
              { value: "bank", label: "Bank" },
            ]}
            value={type}
            onChange={(v) => setType(v as "kas" | "bank")}
          />
          {type === "bank" && <Input label="Nama Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="mis. BCA" />}
          <Input label="No. Rekening (opsional)" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          <CurrencyInput label="Saldo Awal" value={openingBalance} onChange={setOpeningBalance} />
          <Select
            label="COA Terkait (opsional)"
            options={coaSelectOptions}
            value={coaAccountId}
            onChange={setCoaAccountId}
            placeholder="Otomatis dibuat kalau tidak dipilih"
            searchPlaceholder="Cari kode atau nama akun..."
            emptyText="Belum ada akun COA di bawah Kas & Bank"
          />
          <Button className="w-full" onClick={handleSave} disabled={isSaving || !name.trim()}>
            {isSaving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Modal>
    </>
  );
};
