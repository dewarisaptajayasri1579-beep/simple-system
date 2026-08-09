"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  Modal,
  Input,
  Select,
  Alert,
  CurrencyInput,
} from "@/components/ui";
import { Globe, Server as ServerIcon, ArrowUpRight, ArrowDownLeft, Wallet, Plus } from "lucide-react";
import { guessCategoryId } from "@/lib/category-guess";
import { jakartaTodayDateIso } from "@/lib/datetime";

export interface AccountOption {
  id: string;
  name: string;
}

interface DomainOption {
  id: string;
  name: string;
  sellPrice: number | null;
  client: { name: string } | null;
}

interface ServerOption {
  id: string;
  name: string;
  price: number | null;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

const BANK_KEYWORDS = ["mandiri", "bca", "bri", "bni", "bsi"];

function detectAccountType(name: string): "kas" | "bank" {
  const lower = name.trim().toLowerCase();
  if (!lower) return "kas";
  if (lower.startsWith("bank")) return "bank";
  return BANK_KEYWORDS.some((k) => lower.includes(k)) ? "bank" : "kas";
}

export const KeuanganPanel: React.FC<{ accounts: AccountOption[]; userRole: string }> = ({ accounts, userRole }) => {
  const router = useRouter();
  const isOwner = userRole === "owner";
  const [error, setError] = useState("");

  // Modal: akun baru
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountModalContext, setAccountModalContext] = useState<"standalone" | "tx">("standalone");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<"kas" | "bank">("kas");
  const [bankName, setBankName] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Modal: transaksi manual (Kas Masuk / Kas Keluar)
  const [txModalType, setTxModalType] = useState<"income" | "expense" | null>(null);
  const [txAccountId, setTxAccountId] = useState(accounts[0]?.id ?? "");
  const [txAmount, setTxAmount] = useState(0);
  const [txCost, setTxCost] = useState(0);
  const [txOccurredAt, setTxOccurredAt] = useState(jakartaTodayDateIso());
  const [txDescription, setTxDescription] = useState("");
  const [txCategoryId, setTxCategoryId] = useState("");
  const [categoryAuto, setCategoryAuto] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [isSavingTx, setIsSavingTx] = useState(false);

  // Modal: Bayar Domain / Bayar Server
  const [billModalType, setBillModalType] = useState<"domain" | "server" | null>(null);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [billItemId, setBillItemId] = useState("");
  const [billAccountId, setBillAccountId] = useState(accounts[0]?.id ?? "");
  const [billAmount, setBillAmount] = useState(0);
  const [billPaidAt, setBillPaidAt] = useState(jakartaTodayDateIso());
  const [isSavingBill, setIsSavingBill] = useState(false);

  const accountOptions = useMemo(() => accounts.map((a) => ({ value: a.id, label: a.name })), [accounts]);

  useEffect(() => {
    if (!txModalType) return;
    let cancelled = false;
    fetch(`/api/categories?kind=${txModalType}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        setCategoryOptions(data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [txModalType]);

  // Tebak kategori dari keterangan yang diketik (mis. "bayar listrik" -> kategori "Biaya
  // Listrik" kalau sudah ada), supaya COA-nya ikut otomatis terisi saat posting jurnal —
  // lihat getCategoryCoaCode. Berhenti menebak begitu user pilih kategori manual sendiri.
  useEffect(() => {
    if (!txModalType) return;
    if (txCategoryId && !categoryAuto) return;
    const guess = guessCategoryId(txDescription, categoryOptions);
    if (guess) {
      setTxCategoryId(guess);
      setCategoryAuto(true);
    } else if (categoryAuto) {
      setTxCategoryId("");
      setCategoryAuto(false);
    }
  }, [txDescription, categoryOptions, txModalType, txCategoryId, categoryAuto]);

  useEffect(() => {
    if (billModalType === "domain" && domains.length === 0) {
      fetch("/api/domains")
        .then((r) => r.json())
        .then((data: DomainOption[]) => setDomains(Array.isArray(data) ? data.filter((d) => (d.sellPrice ?? 0) > 0) : []))
        .catch(() => {});
    }
    if (billModalType === "server" && servers.length === 0) {
      fetch("/api/servers")
        .then((r) => r.json())
        .then((data: ServerOption[]) => setServers(Array.isArray(data) ? data.filter((s) => (s.price ?? 0) > 0) : []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billModalType]);

  const handleCreateCategory = async (name: string) => {
    if (!txModalType) return null;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind: txModalType }),
    });
    const cat = await res.json().catch(() => null);
    if (!res.ok || !cat?.id) return null;
    const newOption = { value: cat.id as string, label: cat.name as string };
    setCategoryOptions((prev) =>
      prev.some((o) => o.value === newOption.value)
        ? prev
        : [...prev, newOption].sort((a, b) => a.label.localeCompare(b.label))
    );
    return newOption;
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
      if (accountModalContext === "tx" && data?.id) {
        setTxAccountId(data.id);
      }
      setIsAccountModalOpen(false);
      setAccountModalContext("standalone");
      setAccountName("");
      setAccountType("kas");
      setBankName("");
      setOpeningBalance(0);
      router.refresh();
    } finally {
      setIsSavingAccount(false);
    }
  };

  const openAccountModal = () => {
    setAccountModalContext("standalone");
    setAccountName("");
    setAccountType("kas");
    setBankName("");
    setOpeningBalance(0);
    setIsAccountModalOpen(true);
  };

  const closeAccountModal = () => {
    setIsAccountModalOpen(false);
    setAccountModalContext("standalone");
  };

  const openAccountModalFromTx = (name: string) => {
    setAccountModalContext("tx");
    setAccountName(name);
    setAccountType(detectAccountType(name));
    setBankName("");
    setOpeningBalance(0);
    setIsAccountModalOpen(true);
  };

  const openTxModal = (type: "income" | "expense") => {
    setTxModalType(type);
    setTxAccountId(accounts[0]?.id ?? "");
    setTxAmount(0);
    setTxCost(0);
    setTxOccurredAt(jakartaTodayDateIso());
    setTxDescription("");
    setTxCategoryId("");
    setCategoryAuto(false);
    setCategoryOptions([]);
    setError("");
  };

  const handleSaveTx = async () => {
    if (!txAccountId || !txAmount || txAmount <= 0) {
      setError("Akun dan jumlah wajib diisi");
      return;
    }
    setIsSavingTx(true);
    setError("");
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: txModalType,
          accountId: txAccountId,
          grossAmount: txAmount,
          cost: txCost,
          categoryId: txCategoryId || null,
          description: txDescription,
          occurredAt: txOccurredAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan transaksi");
        setIsSavingTx(false);
        return;
      }
      setTxModalType(null);
      window.dispatchEvent(new Event("transactions-changed"));
      router.refresh();
    } catch {
      setError("Gagal menghubungi server");
      setIsSavingTx(false);
    } finally {
      setIsSavingTx(false);
    }
  };

  const openBillModal = (type: "domain" | "server") => {
    setBillModalType(type);
    setBillItemId("");
    setBillAccountId(accounts[0]?.id ?? "");
    setBillAmount(0);
    setBillPaidAt(jakartaTodayDateIso());
    setError("");
  };

  const billItemOptions = useMemo(() => {
    if (billModalType === "domain") {
      return domains.map((d) => ({ value: d.id, label: `${d.name}${d.client ? ` — ${d.client.name}` : ""} · ${formatRupiah(d.sellPrice ?? 0)}` }));
    }
    if (billModalType === "server") {
      return servers.map((s) => ({ value: s.id, label: `${s.name} · ${formatRupiah(s.price ?? 0)}` }));
    }
    return [];
  }, [billModalType, domains, servers]);

  // Nominal (HPP/biaya modal) WAJIB diisi manual — TIDAK di-prefill dari harga jual (itu harga
  // ke client, beda dengan biaya modal aslinya, lihat label "Biaya (HPP)" di bawah).
  const handleBillItemChange = (id: string) => {
    setBillItemId(id);
    setBillAmount(0);
  };

  const handleSaveBill = async () => {
    if (!billItemId) {
      setError(billModalType === "domain" ? "Pilih domain dulu" : "Pilih server dulu");
      return;
    }
    if (!billAccountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    if (!billAmount || billAmount <= 0) {
      setError("Nominal wajib diisi");
      return;
    }
    setIsSavingBill(true);
    setError("");
    try {
      const res = await fetch(`/api/${billModalType === "domain" ? "domains" : "servers"}/${billItemId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: billAccountId, amount: billAmount, paidAt: billPaidAt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menandai lunas");
        setIsSavingBill(false);
        return;
      }
      setBillModalType(null);
      window.dispatchEvent(new Event("transactions-changed"));
      router.refresh();
    } catch {
      setError("Gagal menghubungi server");
      setIsSavingBill(false);
    } finally {
      setIsSavingBill(false);
    }
  };

  const menuCards = [
    isOwner && {
      key: "domain",
      icon: <Globe className="w-6 h-6" />,
      title: "Bayar Domain",
      description: "Tandai lunas perpanjangan domain",
      onClick: () => openBillModal("domain"),
      accent: "text-blue-600 bg-blue-50",
    },
    isOwner && {
      key: "server",
      icon: <ServerIcon className="w-6 h-6" />,
      title: "Bayar Server",
      description: "Tandai lunas sewa server/hosting",
      onClick: () => openBillModal("server"),
      accent: "text-indigo-600 bg-indigo-50",
    },
    {
      key: "kas-keluar",
      icon: <ArrowUpRight className="w-6 h-6" />,
      title: "Kas Keluar",
      description: "Catat pengeluaran kas/bank",
      onClick: () => openTxModal("expense"),
      accent: "text-rose-600 bg-rose-50",
    },
    {
      key: "kas-masuk",
      icon: <ArrowDownLeft className="w-6 h-6" />,
      title: "Kas Masuk",
      description: "Catat pemasukan kas/bank manual",
      onClick: () => openTxModal("income"),
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      key: "pelunasan",
      icon: <Wallet className="w-6 h-6" />,
      title: "Pelunasan",
      description: "Bayar piutang invoice client",
      href: "/pembayaran",
      accent: "text-amber-600 bg-amber-50",
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    accent: string;
    onClick?: () => void;
    href?: string;
  }>;

  return (
    <div className="space-y-6">
      {error && !txModalType && !isAccountModalOpen && !billModalType && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {menuCards.map((card) =>
          card.href ? (
            <Link key={card.key} href={card.href}>
              <Card variant="feature" padding="md" className="h-full hover:-translate-y-0.5 transition-transform cursor-pointer">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.accent}`}>{card.icon}</div>
                <CardTitle className="mt-3 text-base">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </Card>
            </Link>
          ) : (
            <button key={card.key} type="button" onClick={card.onClick} className="text-left h-full cursor-pointer">
              <Card variant="feature" padding="md" className="h-full hover:-translate-y-0.5 transition-transform">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${card.accent}`}>{card.icon}</div>
                <CardTitle className="mt-3 text-base">{card.title}</CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </Card>
            </button>
          )
        )}
      </div>

      <Button variant="outline" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAccountModal}>
        Tambah Akun Kas/Bank
      </Button>

      <Modal
        isOpen={txModalType !== null}
        onClose={() => {
          // Saat modal Akun terbuka di atasnya (lihat openAccountModalFromTx), kedua modal
          // sama-sama mendengarkan tombol Escape — tanpa guard ini, Escape akan menutup modal
          // transaksi juga dan membuang input yang sedang diisi.
          if (!isAccountModalOpen) setTxModalType(null);
        }}
        title={txModalType === "expense" ? "Kas Keluar" : "Kas Masuk"}
      >
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Select
            label="Akun"
            options={accountOptions}
            value={txAccountId}
            onChange={setTxAccountId}
            placeholder="Pilih Kas/Bank"
            searchPlaceholder="Cari atau ketik untuk tambah..."
            emptyText="Belum ada, ketik untuk menambah"
            creatable
            deferCreate
            onCreateOption={openAccountModalFromTx}
            createOptionLabel={(q) => `Tambah akun "${q}"`}
          />
          <CurrencyInput label="Jumlah" value={txAmount} onChange={setTxAmount} />
          {txModalType === "income" && (
            <CurrencyInput label="Biaya (dipotong sebelum split, opsional)" value={txCost} onChange={setTxCost} />
          )}
          <Input label="Tanggal" type="date" value={txOccurredAt} onChange={(e) => setTxOccurredAt(e.target.value)} />
          <Input label="Keterangan (opsional)" value={txDescription} onChange={(e) => setTxDescription(e.target.value)} placeholder="mis. bayar listrik kantor" />
          <div>
            <Select
              label={txModalType === "income" ? "Pendapatan (opsional)" : "Biaya (opsional)"}
              options={categoryOptions}
              value={txCategoryId}
              onChange={(v) => {
                setTxCategoryId(v);
                setCategoryAuto(false);
              }}
              placeholder={txModalType === "income" ? "Pilih atau tambah pendapatan" : "Pilih atau tambah biaya"}
              searchPlaceholder="Cari atau ketik untuk tambah..."
              emptyText="Belum ada, ketik untuk menambah"
              creatable
              onCreateOption={handleCreateCategory}
              createOptionLabel={(q) => `Tambah "${q}"`}
            />
            {categoryAuto && txCategoryId && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 mt-1.5">
                Terdeteksi otomatis dari keterangan — COA ikut otomatis, ganti kalau salah
              </p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setTxModalType(null)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveTx} isLoading={isSavingTx}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={billModalType !== null} onClose={() => setBillModalType(null)} title={billModalType === "domain" ? "Bayar Domain" : "Bayar Server"}>
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Select
            label={billModalType === "domain" ? "Domain" : "Server"}
            options={billItemOptions}
            value={billItemId}
            onChange={setBillItemId}
            placeholder={billModalType === "domain" ? "Pilih domain" : "Pilih server"}
            emptyText="Tidak ada — pastikan sudah punya harga di Master Data"
          />
          <Select label="Bayar dari Akun" options={accountOptions} value={billAccountId} onChange={setBillAccountId} placeholder="Pilih Kas/Bank" />
          <CurrencyInput label="Biaya (HPP) — bukan harga jual" value={billAmount} onChange={setBillAmount} placeholder="mis. 300.000" />
          <Input label="Tanggal" type="date" value={billPaidAt} onChange={(e) => setBillPaidAt(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setBillModalType(null)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveBill} isLoading={isSavingBill}>
              Tandai Lunas
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isAccountModalOpen} onClose={closeAccountModal} title="Akun Kas/Bank Baru">
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
            <Button variant="ghost" onClick={closeAccountModal}>
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
