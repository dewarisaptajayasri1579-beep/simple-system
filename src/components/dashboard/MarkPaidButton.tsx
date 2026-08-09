"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Select, CurrencyInput, Alert } from "@/components/ui";

export interface AccountOption {
  id: string;
  name: string;
}

/** Tombol "Bayar" siap-pakai untuk item internal (biaya berkala/domain/server yang bukan milik
 *  client) — pilih akun Kas/Bank, lalu POST ke endpoint mark-paid terkait. Hasilnya jadi
 *  Transaction Kas/Bank Keluar berstatus Draft (perlu di-posting dari menu Keuangan sebelum
 *  benar-benar mengurangi saldo), bukan langsung final.
 *
 *  `requireAmount` dipakai untuk Domain/Server — harga jual (ke client) beda dari HPP/biaya
 *  modal asli, jadi HPP-nya wajib diketik manual di sini, TIDAK diambil otomatis dari harga
 *  jual. Biaya Berkala tidak perlu ini (Price di situ memang sudah biaya asli). */
export const MarkPaidButton: React.FC<{ url: string; itemLabel: string; accounts: AccountOption[]; requireAmount?: boolean }> = ({
  url,
  itemLabel,
  accounts,
  requireAmount,
}) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!accountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    if (requireAmount && amount <= 0) {
      setError("Isi dulu Biaya (HPP)-nya");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requireAmount ? { accountId, amount } : { accountId }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menandai lunas");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Bayar Sekarang
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Bayar Sekarang"
        subtitle={`Tandai "${itemLabel}" lunas — masuk sebagai Kas/Bank Keluar (draft, perlu diposting dari menu Keuangan).`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSubmit} isLoading={saving}>
              Tandai Lunas
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert variant="error">{error}</Alert>}
          <Select
            label="Bayar dari Akun"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={accountId}
            onChange={setAccountId}
            placeholder="Pilih Kas/Bank"
          />
          {requireAmount && (
            <CurrencyInput label="Biaya (HPP) — bukan harga jual" value={amount} onChange={setAmount} placeholder="mis. 300.000" />
          )}
        </div>
      </Modal>
    </>
  );
};
