"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Modal,
  Input,
  Select,
  Alert,
  FilterableTable,
  CurrencyInput,
  type FilterableColumn,
} from "@/components/ui";
import { Plus, Wallet, Landmark, Sparkles } from "lucide-react";
import { guessCategoryId } from "@/lib/category-guess";

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  balance: number;
}

export interface TransactionRow {
  id: string;
  type: string;
  accountName: string;
  categoryName: string | null;
  grossAmount: number;
  netAmount: number;
  description: string | null;
  occurredAt: string;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

const BANK_KEYWORDS = ["mandiri", "bca", "bri", "bni", "bsi"];

function detectAccountType(name: string): "kas" | "bank" {
  const lower = name.trim().toLowerCase();
  if (!lower) return "kas";
  if (lower.startsWith("bank")) return "bank";
  return BANK_KEYWORDS.some((k) => lower.includes(k)) ? "bank" : "kas";
}

const TRANSACTION_COLUMNS: FilterableColumn<TransactionRow>[] = [
  { key: "occurredAt", header: "Tanggal", cell: (t) => formatDate(t.occurredAt) },
  { key: "accountName", header: "Akun", filterValue: (t) => t.accountName, cell: (t) => t.accountName },
  { key: "categoryName", header: "Kategori", filterValue: (t) => t.categoryName ?? "", cell: (t) => t.categoryName ?? "-" },
  { key: "description", header: "Keterangan", filterValue: (t) => t.description ?? "", cell: (t) => t.description ?? "-" },
  {
    key: "type",
    header: "Tipe",
    filterValue: (t) => t.type,
    filterOptions: [
      { value: "income", label: "Masuk" },
      { value: "expense", label: "Keluar" },
    ],
    cell: (t) => (
      <span className={t.type === "income" ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
        {t.type === "income" ? "Masuk" : "Keluar"}
      </span>
    ),
  },
  { key: "grossAmount", header: "Jumlah", cellClassName: "font-semibold", cell: (t) => formatRupiah(t.grossAmount) },
];

export const KeuanganPanel: React.FC<{ accounts: AccountRow[]; transactions: TransactionRow[] }> = ({ accounts, transactions }) => {
  const router = useRouter();
  const [error, setError] = useState("");

  // Modal: akun baru
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountModalContext, setAccountModalContext] = useState<"standalone" | "tx">("standalone");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<"kas" | "bank">("kas");
  const [bankName, setBankName] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  // Modal: transaksi manual
  const [txModalType, setTxModalType] = useState<"income" | "expense" | null>(null);
  const [txAccountId, setTxAccountId] = useState(accounts[0]?.id ?? "");
  const [txAmount, setTxAmount] = useState(0);
  const [txCost, setTxCost] = useState(0);
  const [txDescription, setTxDescription] = useState("");
  const [txCategoryId, setTxCategoryId] = useState("");
  const [categoryAuto, setCategoryAuto] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [isSavingTx, setIsSavingTx] = useState(false);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan transaksi");
        setIsSavingTx(false);
        return;
      }
      setTxModalType(null);
      router.refresh();
    } catch {
      setError("Gagal menghubungi server");
      setIsSavingTx(false);
    } finally {
      setIsSavingTx(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && !txModalType && !isAccountModalOpen && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => openTxModal("income")}>
          Input Pemasukan Manual
        </Button>
        <Button variant="danger" leftIcon={<Plus className="w-4 h-4" />} onClick={() => openTxModal("expense")}>
          Input Pengeluaran
        </Button>
        <Button variant="outline" leftIcon={<Plus className="w-4 h-4" />} onClick={openAccountModal}>
          Tambah Akun
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <Card key={acc.id} variant="feature" padding="md">
            <div className="flex items-center gap-2 text-slate-500">
              {acc.type === "bank" ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
              <CardDescription>{acc.name}{acc.bankName ? ` — ${acc.bankName}` : ""}</CardDescription>
            </div>
            <p className="text-xl font-black text-slate-900 mt-1">{formatRupiah(acc.balance)}</p>
          </Card>
        ))}
      </div>

      <Card variant="panel" padding="none">
        <CardHeader className="p-5 sm:p-6 mb-0">
          <CardTitle>Riwayat Transaksi</CardTitle>
          <CardDescription>{transactions.length} transaksi terbaru</CardDescription>
        </CardHeader>
        <FilterableTable
          columns={TRANSACTION_COLUMNS}
          rows={transactions}
          rowKey={(t) => t.id}
          emptyMessage="Belum ada transaksi manual."
        />
      </Card>

      <Modal
        isOpen={txModalType !== null}
        onClose={() => {
          // Saat modal Akun terbuka di atasnya (lihat openAccountModalFromTx), kedua modal
          // sama-sama mendengarkan tombol Escape — tanpa guard ini, Escape akan menutup modal
          // transaksi juga dan membuang input yang sedang diisi.
          if (!isAccountModalOpen) setTxModalType(null);
        }}
        title={txModalType === "expense" ? "Input Pengeluaran" : "Input Pemasukan Manual"}
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
                <Sparkles className="w-3.5 h-3.5" /> Terdeteksi otomatis dari keterangan — COA ikut otomatis, ganti kalau salah
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
