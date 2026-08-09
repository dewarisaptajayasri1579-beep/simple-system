"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, Modal, Input, Select, Alert, CurrencyInput } from "@/components/ui";
import { ArrowUpRight, ArrowDownLeft, Landmark, Plus } from "lucide-react";

const BANK_KEYWORDS = ["mandiri", "bca", "bri", "bni", "bsi"];

function detectAccountType(name: string): "kas" | "bank" {
  const lower = name.trim().toLowerCase();
  if (!lower) return "kas";
  if (lower.startsWith("bank")) return "bank";
  return BANK_KEYWORDS.some((k) => lower.includes(k)) ? "bank" : "kas";
}

/** Halaman induk Keuangan — tiap kartu navigasi ke halaman riwayat + tambah entri sendiri,
 *  bukan modal di tempat, supaya histori pembayaran per kategori langsung kelihatan. Bayar
 *  Domain/Server tidak lagi menu terpisah — jadi salah satu Tipe baris di Kas Keluar. */
export const KeuanganPanel: React.FC<{ userRole: string }> = ({ userRole }) => {
  const router = useRouter();
  const isOwner = userRole === "owner";

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<"kas" | "bank">("kas");
  const [bankName, setBankName] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [error, setError] = useState("");

  const openAccountModal = () => {
    setAccountName("");
    setAccountType("kas");
    setBankName("");
    setOpeningBalance(0);
    setError("");
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = async () => {
    if (!accountName.trim()) return;
    setIsSavingAccount(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: accountName, type: accountType, bankName, openingBalance }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Gagal menyimpan akun");
        setIsSavingAccount(false);
        return;
      }
      setIsAccountModalOpen(false);
      router.refresh();
    } finally {
      setIsSavingAccount(false);
    }
  };

  const menuCards = [
    {
      key: "kas-keluar",
      icon: <ArrowUpRight className="w-6 h-6" />,
      title: "Kas Keluar",
      description: "Catat pengeluaran kas/bank — termasuk Bayar Domain/Server",
      href: "/keuangan/kas-keluar",
      accent: "text-rose-600 bg-rose-50",
    },
    {
      key: "kas-masuk",
      icon: <ArrowDownLeft className="w-6 h-6" />,
      title: "Kas Masuk",
      description: "Catat pemasukan kas/bank manual",
      href: "/keuangan/kas-masuk",
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      key: "akun-kas-bank",
      icon: <Landmark className="w-6 h-6" />,
      title: "Akun Kas dan Bank",
      description: "Lihat dan edit akun kas/bank beserta COA terkait",
      href: "/keuangan/akun-kas-bank",
      accent: "text-indigo-600 bg-indigo-50",
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    href: string;
    accent: string;
  }>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {menuCards.map((card) => (
          <Link key={card.key} href={card.href}>
            <Card variant="feature" padding="md" className="h-full hover:-translate-y-0.5 transition-transform cursor-pointer">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.accent}`}>{card.icon}</div>
              <CardTitle className="mt-3 text-base">{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </Card>
          </Link>
        ))}
      </div>

      <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAccountModal}>
        Tambah Akun Kas/Bank
      </Button>

      <Modal isOpen={isAccountModalOpen} onClose={() => setIsAccountModalOpen(false)} title="Akun Kas/Bank Baru">
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Input
            label="Nama Akun"
            value={accountName}
            onChange={(e) => {
              const name = e.target.value;
              setAccountName(name);
              if (detectAccountType(name) === "bank") setAccountType("bank");
            }}
            placeholder="mis. BCA Utama"
          />
          <Select
            label="Jenis"
            options={[{ value: "kas", label: "Kas" }, { value: "bank", label: "Bank" }]}
            value={accountType}
            onChange={(v) => setAccountType(v as "kas" | "bank")}
          />
          {accountType === "bank" && <Input label="Nama Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />}
          <CurrencyInput label="Saldo Awal" value={openingBalance} onChange={setOpeningBalance} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsAccountModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveAccount} isLoading={isSavingAccount}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
