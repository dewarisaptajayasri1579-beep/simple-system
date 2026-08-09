"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Input, Alert } from "@/components/ui";
import { jakartaTodayDateIso } from "@/lib/datetime";

/** Tombol "Update Jawaban Client" — tahap 2 SLA tindak-lanjut tagihan (lihat sop.txt): setelah
 *  invoice dibuat & client sudah dihubungi/jawab, staf catat tanggal janji bayarnya di sini.
 *  Cuma muncul kalau item itu punya BillingFollowUp aktif yang sudah "invoicedAt" tapi belum
 *  "clientRespondedAt" (lihat DashboardSections.tsx). */
export const BillingFollowUpRespondButton: React.FC<{ followUpId: string; itemLabel: string }> = ({ followUpId, itemLabel }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [promisedPayAt, setPromisedPayAt] = useState(jakartaTodayDateIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!promisedPayAt) {
      setError("Isi dulu tanggal janji bayarnya");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/billing-follow-ups/${followUpId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promisedPayAt }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan jawaban Client");
      return;
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Update Jawaban Client
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Update Jawaban Client"
        subtitle={`Client sudah dihubungi soal tagihan "${itemLabel}" — kapan janji bayarnya?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSubmit} isLoading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert variant="error">{error}</Alert>}
          <Input label="Tanggal Janji Bayar" type="date" value={promisedPayAt} onChange={(e) => setPromisedPayAt(e.target.value)} />
        </div>
      </Modal>
    </>
  );
};
