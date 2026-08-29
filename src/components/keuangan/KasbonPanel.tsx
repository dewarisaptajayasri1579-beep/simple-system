"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, Select, Input, Alert, CurrencyInput, Modal } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AccountPicker, type AccountOption } from "./AccountPicker";
import { jakartaTodayDateIso } from "@/lib/datetime";

interface UserOption {
  id: string;
  name: string;
}

interface KasbonRow {
  id: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  status: "outstanding" | "lunas";
  user: UserOption;
  disbursed: number;
  outstanding: number;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Kasbon Tim — beri uang muka ke User (karyawan) & catat pelunasannya. Pencairan & pelunasan
 *  sama-sama cuma baris Transaction (refType="kasbon") yang ikut alur draft->posted umum
 *  (lihat Draft Transaksi/Lihat Jurnal), Kasbon sendiri cuma model ringan siapa/berapa/status. */
export const KasbonPanel: React.FC<{
  accounts: AccountOption[];
  users: UserOption[];
  kasbons: KasbonRow[];
}> = ({ accounts: initialAccounts, users, kasbons }) => {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [error, setError] = useState("");

  const [userId, setUserId] = useState("");
  const [accountId, setAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(jakartaTodayDateIso());
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!userId) return setError("Karyawan penerima wajib dipilih");
    if (!accountId) return setError("Akun kas/bank wajib dipilih");
    if (!amount || amount <= 0) return setError("Nominal kasbon tidak valid");

    setSaving(true);
    const res = await fetch("/api/kasbon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, accountId, amount, description, occurredAt }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) return setError(data?.error || "Gagal menyimpan Kasbon");

    setUserId("");
    setAmount(0);
    setDescription("");
    router.refresh();
  };

  // Modal "Bayar Cicilan" — dibuka per baris kasbon yang masih outstanding.
  const [repayTarget, setRepayTarget] = useState<KasbonRow | null>(null);
  const [repayAccountId, setRepayAccountId] = useState(initialAccounts[0]?.id ?? "");
  const [repayAmount, setRepayAmount] = useState(0);
  const [repayOccurredAt, setRepayOccurredAt] = useState(jakartaTodayDateIso());
  const [repaySaving, setRepaySaving] = useState(false);
  const [repayError, setRepayError] = useState("");

  const openRepay = (row: KasbonRow) => {
    setRepayTarget(row);
    setRepayAccountId(accounts[0]?.id ?? "");
    setRepayAmount(row.outstanding);
    setRepayOccurredAt(jakartaTodayDateIso());
    setRepayError("");
  };

  const handleRepay = async () => {
    if (!repayTarget) return;
    setRepayError("");
    if (!repayAccountId) return setRepayError("Akun kas/bank tujuan wajib dipilih");
    if (!repayAmount || repayAmount <= 0) return setRepayError("Nominal pelunasan tidak valid");

    setRepaySaving(true);
    const res = await fetch(`/api/kasbon/${repayTarget.id}/repay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: repayAccountId, amount: repayAmount, occurredAt: repayOccurredAt }),
    });
    const data = await res.json().catch(() => null);
    setRepaySaving(false);
    if (!res.ok) return setRepayError(data?.error || "Gagal menyimpan pelunasan");

    setRepayTarget(null);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card variant="feature" padding="lg">
        <CardTitle>Beri Kasbon</CardTitle>
        <CardDescription>Uang muka ke karyawan — dicatat sebagai piutang karyawan, dilunasi tunai/transfer.</CardDescription>

        {error && (
          <Alert variant="error" onClose={() => setError("")} className="mt-4">
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Select
            label="Karyawan Penerima"
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            value={userId}
            onChange={setUserId}
            placeholder="Pilih karyawan"
          />
          <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} onAccountCreated={(a) => setAccounts((prev) => [...prev, a])} />
          <CurrencyInput label="Nominal Kasbon" value={amount} onChange={setAmount} />
          <Input label="Tanggal Cair" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <div className="sm:col-span-2">
            <Input label="Keterangan (opsional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. kasbon keperluan pribadi" />
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={handleSubmit} isLoading={saving}>
            Simpan Kasbon
          </Button>
        </div>
      </Card>

      <Card variant="feature" padding="lg">
        <CardTitle>Daftar Kasbon</CardTitle>
        <CardDescription>Pencairan & pelunasan masih draft sampai diposting lewat Draft Transaksi.</CardDescription>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                <th className="py-2 pr-3">Karyawan</th>
                <th className="py-2 pr-3">Tanggal</th>
                <th className="py-2 pr-3 text-right">Nominal</th>
                <th className="py-2 pr-3 text-right">Sudah Dibayar</th>
                <th className="py-2 pr-3 text-right">Sisa</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {kasbons.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 font-medium">
                    Belum ada kasbon.
                  </td>
                </tr>
              )}
              {kasbons.map((k) => {
                const isDraft = k.disbursed <= 0;
                const badge = isDraft
                  ? { type: "draft" as const, label: "Belum Diposting" }
                  : k.status === "lunas"
                    ? { type: "paid" as const, label: "Lunas" }
                    : { type: "unpaid" as const, label: "Outstanding" };
                return (
                  <tr key={k.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{k.user.name}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{formatDate(k.occurredAt)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatRupiah(k.amount)}</td>
                    <td className="py-2.5 pr-3 text-right">{formatRupiah(k.disbursed - k.outstanding)}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-slate-800">{formatRupiah(Math.max(k.outstanding, 0))}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge type={badge.type} label={badge.label} size="sm" />
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      {!isDraft && k.status === "outstanding" && (
                        <Button variant="secondary" size="sm" onClick={() => openRepay(k)}>
                          Bayar Cicilan
                        </Button>
                      )}
                      {isDraft && (
                        <Link href="/keuangan" className="text-xs font-bold text-blue-600 hover:underline">
                          Posting dulu
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={!!repayTarget} onClose={() => setRepayTarget(null)} title={`Bayar Cicilan — ${repayTarget?.user.name ?? ""}`}>
        <div className="space-y-4">
          {repayError && (
            <Alert variant="error" onClose={() => setRepayError("")}>
              {repayError}
            </Alert>
          )}
          <p className="text-sm text-slate-600">Sisa saat ini: <span className="font-bold text-slate-800">{formatRupiah(repayTarget?.outstanding ?? 0)}</span></p>
          <AccountPicker label="Akun Penerima" accounts={accounts} value={repayAccountId} onChange={setRepayAccountId} onAccountCreated={(a) => setAccounts((prev) => [...prev, a])} />
          <CurrencyInput label="Nominal Dibayar" value={repayAmount} onChange={setRepayAmount} />
          <Input label="Tanggal" type="date" value={repayOccurredAt} onChange={(e) => setRepayOccurredAt(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRepayTarget(null)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleRepay} isLoading={repaySaving}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
