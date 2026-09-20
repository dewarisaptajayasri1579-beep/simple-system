"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Alert, Textarea } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";

/** Dua "rem" manual Owner untuk sebuah piutang, dipakai di kolom Tindakan tabel Piutang
 *  (Dashboard). Keduanya minta alasan wajib dan tersimpan di audit log:
 *
 *  - **Pending**   — penagihan ditunda sementara (client minta tempo/lagi nego). Tagihannya
 *                    TETAP dihitung di Piutang Outstanding, cuma berhenti ditagih otomatis.
 *  - **Ragu-Ragu** — dianggap tidak akan cair. Keluar dari Piutang Outstanding dan pindah ke
 *                    section "Piutang Ragu-Ragu" (lihat PiutangRaguRaguSection).
 *
 *  Tidak ada jurnal di balik keduanya — Piutang di app ini bukan akun GL, cuma hasil hitung
 *  Invoice.totalAmount − pembayaran posted (lihat pedoman_akunting.md). */

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount || 0);
}

interface ReasonButtonProps {
  label: string;
  title: string;
  subtitle: string;
  /** Endpoint yang di-POST dengan { reason }. */
  endpoint: string;
  confirmLabel: string;
  className?: string;
  placeholder: string;
}

/** Tombol + modal "isi alasan lalu kirim" — dipakai bareng oleh Pending & Ragu-Ragu supaya
 *  validasi (alasan wajib), penanganan error, dan refresh-nya persis sama. */
const ReasonButton: React.FC<ReasonButtonProps> = ({ label, title, subtitle, endpoint, confirmLabel, className, placeholder }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan");
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={subtitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={submit} isLoading={saving} disabled={!reason.trim()}>
              {confirmLabel}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Textarea label="Alasan (wajib)" placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          <p className="text-xs text-slate-500 font-medium">Alasan ini tersimpan permanen di riwayat (audit log) bersama nama kamu dan tanggalnya.</p>
        </div>
      </Modal>
    </>
  );
};

/** Tombol lepas status (DELETE ke endpoint yang sama) — mis. "Lepas Pending". */
export const ClearStatusButton: React.FC<{ endpoint: string; label: string; confirmText: string }> = ({ endpoint, label, confirmText }) => {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!confirm(confirmText)) return;
    setSaving(true);
    setError("");
    const res = await fetch(endpoint, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={submit} isLoading={saving}>
        {label}
      </Button>
      {error && <p className="text-[11px] font-semibold text-rose-700">{error}</p>}
    </div>
  );
};

export const MarkDoubtfulButton: React.FC<{ invoiceId: string; itemLabel: string; remaining: number }> = ({ invoiceId, itemLabel, remaining }) => (
  <ReasonButton
    label="Ragu-Ragu"
    className="!text-amber-700 !border-amber-300 hover:!bg-amber-50"
    title="Tandai Piutang Ragu-Ragu"
    subtitle={`${itemLabel} — sisa ${formatRupiah(remaining)} akan DIKELUARKAN dari Piutang Outstanding dan berhenti ditagih otomatis. Invoice-nya tetap tersimpan dan bisa diaktifkan lagi kapan saja.`}
    endpoint={`/api/invoices/${invoiceId}/doubtful`}
    confirmLabel="Tandai Ragu-Ragu"
    placeholder="Mis. client sudah tidak bisa dihubungi sejak Maret, kantornya tutup."
  />
);

export const MarkPendingButton: React.FC<{ invoiceId: string; itemLabel: string; remaining: number }> = ({ invoiceId, itemLabel, remaining }) => (
  <ReasonButton
    label="Pending"
    className="!text-sky-700 !border-sky-300 hover:!bg-sky-50"
    title="Tandai Piutang Pending"
    subtitle={`${itemLabel} — sisa ${formatRupiah(remaining)} TETAP dihitung di Piutang Outstanding, cuma berhenti ditagih otomatis sampai statusnya dilepas.`}
    endpoint={`/api/invoices/${invoiceId}/pending`}
    confirmLabel="Tandai Pending"
    placeholder="Mis. client minta tempo sampai akhir bulan, nunggu pencairan termin dari pusat."
  />
);

/** Sel "Tindakan" di tabel Piutang — menyesuaikan status invoice-nya sekarang. Cuma dirender
 *  untuk Owner (lihat piutangColumns di DashboardSections.tsx). */
export const PiutangStatusCell: React.FC<{
  invoiceId: string;
  itemLabel: string;
  remaining: number;
  pendingAt: string | null;
  pendingReason: string | null;
}> = ({ invoiceId, itemLabel, remaining, pendingAt, pendingReason }) => {
  if (pendingAt) {
    return (
      <div className="space-y-1.5">
        <StatusBadge type="partial" label="Pending" size="sm" />
        {pendingReason && <p className="text-[11px] text-slate-500 font-medium max-w-[180px]">{pendingReason}</p>}
        <div className="flex flex-wrap gap-1.5">
          <ClearStatusButton
            endpoint={`/api/invoices/${invoiceId}/pending`}
            label="Lepas Pending"
            confirmText={`Lepas status pending ${itemLabel}? Tagihan ini kembali masuk antrean penagihan otomatis.`}
          />
          <MarkDoubtfulButton invoiceId={invoiceId} itemLabel={itemLabel} remaining={remaining} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <MarkPendingButton invoiceId={invoiceId} itemLabel={itemLabel} remaining={remaining} />
      <MarkDoubtfulButton invoiceId={invoiceId} itemLabel={itemLabel} remaining={remaining} />
    </div>
  );
};
