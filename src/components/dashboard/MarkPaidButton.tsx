"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Select, Alert } from "@/components/ui";

export interface AccountOption {
  id: string;
  name: string;
}

/** Tombol "Bayar" siap-pakai untuk item internal (biaya berkala/domain/server yang bukan milik
 *  client) — pilih akun Kas/Bank, lalu POST ke endpoint mark-paid terkait. Hasilnya jadi
 *  Transaction Kas/Bank Keluar berstatus Draft (perlu di-posting dari menu Keuangan sebelum
 *  benar-benar mengurangi saldo), bukan langsung final. */
export const MarkPaidButton: React.FC<{ url: string; itemLabel: string; accounts: AccountOption[] }> = ({ url, itemLabel, accounts }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!accountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
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
        </div>
      </Modal>
    </>
  );
};
