"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Modal, Alert, Textarea, Card, CardTitle, CardDescription, FilterableTable, type FilterableColumn } from "@/components/ui";

/** "Piutang Ragu-Ragu" — tagihan yang sah tapi dianggap tidak akan cair (client kabur/bangkrut/
 *  sengketa). Ditandai MANUAL oleh Owner dengan alasan wajib; sejak ditandai, invoice-nya keluar
 *  dari Piutang Outstanding (Dashboard, Piutang, Neraca, Arus Kas) dan berhenti ditagih otomatis.
 *
 *  Tidak ada jurnal apa pun di balik ini — Piutang di app ini memang bukan akun GL, cuma hasil
 *  hitung Invoice.totalAmount − pembayaran posted (lihat pedoman_akunting.md). Beda dari
 *  "Batalkan" (Void) yang artinya invoice-nya salah input. */

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export interface PiutangRaguRaguRow {
  id: string;
  invoiceNumber: string;
  clientName: string;
  remaining: number;
  dueDate: string | null;
  doubtfulAt: string;
  doubtfulReason: string;
  doubtfulByName: string | null;
}

/** Tombol per-baris di tabel Piutang (Dashboard) — cuma dirender untuk Owner. */
export const MarkDoubtfulButton: React.FC<{ invoiceId: string; itemLabel: string; remaining: number }> = ({ invoiceId, itemLabel, remaining }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoiceId}/doubtful`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menandai ragu-ragu");
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" className="!text-amber-700 !border-amber-300 hover:!bg-amber-50" onClick={() => setOpen(true)}>
        Ragu-Ragu
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Tandai Piutang Ragu-Ragu"
        subtitle={`${itemLabel} — sisa ${formatRupiah(remaining)} akan dikeluarkan dari Piutang Outstanding dan berhenti ditagih otomatis. Invoice-nya tetap tersimpan dan bisa diaktifkan lagi kapan saja.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={submit} isLoading={saving} disabled={!reason.trim()}>
              Tandai Ragu-Ragu
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
          <Textarea
            label="Alasan (wajib)"
            placeholder="Mis. client sudah tidak bisa dihubungi sejak Maret, kantornya tutup."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-slate-500 font-medium">
            Alasan ini tersimpan permanen di riwayat (audit log) bersama nama kamu dan tanggalnya.
          </p>
        </div>
      </Modal>
    </>
  );
};

const RestoreButton: React.FC<{ invoiceId: string; itemLabel: string }> = ({ invoiceId, itemLabel }) => {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!confirm(`Aktifkan lagi ${itemLabel}? Invoice ini akan kembali dihitung sebagai Piutang Outstanding dan ditagih seperti biasa.`)) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoiceId}/doubtful`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal mengaktifkan lagi");
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={submit} isLoading={saving}>
        Aktifkan Lagi
      </Button>
      {error && <p className="text-[11px] font-semibold text-rose-700">{error}</p>}
    </div>
  );
};

export const PiutangRaguRaguSection: React.FC<{ rows: PiutangRaguRaguRow[]; isOwner: boolean }> = ({ rows, isOwner }) => {
  const total = rows.reduce((sum, r) => sum + r.remaining, 0);

  const columns: FilterableColumn<PiutangRaguRaguRow>[] = [
    {
      key: "invoiceNumber",
      header: "No. Invoice",
      filterValue: (r) => r.invoiceNumber,
      cellClassName: "font-semibold",
      cell: (r) => (
        <Link href={`/penjualan/${r.id}`} className="hover:underline">
          {r.invoiceNumber}
        </Link>
      ),
    },
    { key: "clientName", header: "Client", filterValue: (r) => r.clientName, cell: (r) => r.clientName },
    { key: "dueDate", header: "Jatuh Tempo", cell: (r) => formatDate(r.dueDate) },
    {
      key: "remaining",
      header: "Sisa",
      cellClassName: "font-semibold text-amber-700",
      cell: (r) => formatRupiah(r.remaining),
    },
    { key: "doubtfulAt", header: "Ditandai", cell: (r) => formatDate(r.doubtfulAt) },
    { key: "doubtfulByName", header: "Oleh", cell: (r) => r.doubtfulByName ?? "-" },
    {
      key: "doubtfulReason",
      header: "Alasan",
      filterValue: (r) => r.doubtfulReason,
      cell: (r) => <span className="text-xs text-slate-600 font-medium">{r.doubtfulReason}</span>,
    },
    ...(isOwner
      ? [
          {
            key: "aksi",
            header: "Aksi",
            cell: (r: PiutangRaguRaguRow) => <RestoreButton invoiceId={r.id} itemLabel={`${r.invoiceNumber} — ${r.clientName}`} />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 px-1">
        <div>
          <CardTitle>Piutang Ragu-Ragu</CardTitle>
          <CardDescription>
            {rows.length} invoice, total {formatRupiah(total)} — sudah TIDAK dihitung di Piutang Outstanding.
          </CardDescription>
        </div>
      </div>

      <Card variant="panel" padding="none">
        <FilterableTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyMessage="Belum ada piutang yang ditandai ragu-ragu."
          mobileCardMode
        />
      </Card>
    </div>
  );
};
