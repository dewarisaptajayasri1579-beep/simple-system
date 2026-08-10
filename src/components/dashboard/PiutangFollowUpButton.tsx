"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Select, Input, Alert } from "@/components/ui";
import { jakartaTodayDateIso } from "@/lib/datetime";

const RESPONSE_OPTIONS = [
  { value: "sudah_bayar", label: "Sudah Bayar" },
  { value: "janji_bayar", label: "Janji Bayar" },
  { value: "nego", label: "Nego" },
  { value: "tidak_respon", label: "Tidak Merespon" },
  { value: "lainnya", label: "Lainnya" },
];

const RESPONSE_LABEL: Record<string, string> = Object.fromEntries(RESPONSE_OPTIONS.map((o) => [o.value, o.label]));

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

interface ResponseEntry {
  id: string;
  responseType: string;
  note: string | null;
  promisedPayAt: string | null;
  createdAt: string;
  createdByName: string;
}

/** Tombol "Input Respon" + histori follow-up 1 piutang — dipasang di kolom Aksi Dashboard >
 *  Piutang. Tiap submit JADI BARIS BARU di log (bukan menimpa), lihat
 *  /api/billing-follow-ups/[id]/respond. Nyakup semua sumber piutang (Domain/Server/
 *  Maintenance/Project termin/invoice manual) karena dikaitkan lewat invoiceId, bukan per-modul. */
export const PiutangFollowUpButton: React.FC<{ billingFollowUpId: string; itemLabel: string }> = ({ billingFollowUpId, itemLabel }) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ResponseEntry[] | null>(null);
  const [responseType, setResponseType] = useState("sudah_bayar");
  const [note, setNote] = useState("");
  const [promisedPayAt, setPromisedPayAt] = useState(jakartaTodayDateIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = () => {
    fetch(`/api/billing-follow-ups/${billingFollowUpId}/responses`)
      .then((r) => r.json())
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
  };

  useEffect(() => {
    if (open) loadHistory();
  }, [open]);

  const openModal = () => {
    setResponseType("sudah_bayar");
    setNote("");
    setPromisedPayAt(jakartaTodayDateIso());
    setError("");
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (responseType === "janji_bayar" && !promisedPayAt) {
      setError("Isi dulu tanggal janji bayarnya");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/billing-follow-ups/${billingFollowUpId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responseType,
        note: note.trim() || null,
        promisedPayAt: responseType === "janji_bayar" ? promisedPayAt : null,
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan respon");
      return;
    }
    setNote("");
    loadHistory();
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>
        Input Respon
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Respon Client" subtitle={itemLabel} size="lg">
        <div className="space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Respon" options={RESPONSE_OPTIONS} value={responseType} onChange={setResponseType} sizeVariant="sm" />
            {responseType === "janji_bayar" && (
              <Input label="Tanggal Janji Bayar" type="date" sizeVariant="sm" value={promisedPayAt} onChange={(e) => setPromisedPayAt(e.target.value)} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs sm:text-sm font-bold text-slate-700">Catatan</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan bebas soal respon client-nya (opsional)"
              className="w-full rounded-xl px-3 py-2 text-sm bg-white/60 hover:bg-white/80 border border-slate-200/80 text-slate-800 placeholder:text-slate-400 font-medium transition-all duration-200 focus:outline-none focus:bg-white/95 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="primary" onClick={handleSubmit} isLoading={saving}>
              Simpan Respon
            </Button>
          </div>

          <div className="border-t border-slate-200/80 pt-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Histori Follow-up</p>
            {history === null && <p className="text-sm text-slate-400">Memuat...</p>}
            {history !== null && history.length === 0 && <p className="text-sm text-slate-400">Belum ada respon tercatat.</p>}
            <ul className="space-y-2.5 max-h-64 overflow-y-auto">
              {history?.map((h) => (
                <li key={h.id} className="text-sm border border-slate-200/70 rounded-xl px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">{RESPONSE_LABEL[h.responseType] ?? h.responseType}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(h.createdAt)}</span>
                  </div>
                  {h.promisedPayAt && <p className="text-xs text-slate-500 mt-0.5">Janji bayar: {formatDateTime(h.promisedPayAt)}</p>}
                  {h.note && <p className="text-slate-600 mt-1">{h.note}</p>}
                  <p className="text-xs text-slate-400 mt-1">oleh {h.createdByName}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal>
    </>
  );
};
