"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Alert } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface JournalLineRow {
  id: string;
  debit: number;
  credit: number;
  memo: string | null;
  account: { code: string; name: string };
}

interface JournalEntryRow {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  postStatus: "draft" | "posted";
  lines: JournalLineRow[];
}

export interface JournalSource {
  sourceType: string;
  sourceId: string;
}

export interface JournalPreviewModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Biasanya 1 pasang, tapi Pembayaran bisa punya beberapa jurnal sekaligus (per invoice yang
   *  dilunasi + costLink Bayar Domain/Server kalau ada). */
  sources: JournalSource[];
  /** Kalau ada baris draft & prop ini diisi, tombol "Posting" muncul dan memanggil endpoint ini
   *  (endpoint posting transaksi induknya — bukan endpoint jurnal langsung — supaya efek lain
   *  seperti update Invoice.status/lastPaidAt ikut jalan). */
  postUrl?: string;
  postLabel?: string;
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export const JournalPreviewModal: React.FC<JournalPreviewModalProps> = ({ open, onClose, title, sources, postUrl, postLabel }) => {
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    Promise.all(
      sources.map((s) =>
        fetch(`/api/journal-entries?sourceType=${encodeURIComponent(s.sourceType)}&sourceId=${encodeURIComponent(s.sourceId)}`).then((r) => r.json())
      )
    )
      .then((results) => setEntries(results.flat()))
      .catch(() => setError("Gagal memuat jurnal"))
      .finally(() => setLoading(false));
  }, [open, sources]);

  const hasDraft = entries.some((e) => e.postStatus === "draft");

  const handlePost = async () => {
    if (!postUrl) return;
    setPosting(true);
    setError("");
    const res = await fetch(postUrl, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPosting(false);
    if (!res.ok) {
      setError(data?.error || "Gagal posting");
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {loading && <p className="text-sm text-slate-500">Memuat jurnal...</p>}
        {!loading && entries.length === 0 && <p className="text-sm text-slate-500">Belum ada jurnal untuk transaksi ini.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-mono font-semibold">{entry.entryNumber}</span> · {formatDate(entry.date)} · {entry.description}
              </p>
              <StatusBadge type={entry.postStatus} size="sm" />
            </div>
            <div className="rounded-xl border border-slate-200/80 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Akun</th>
                    <th className="text-right px-3 py-2">Debit</th>
                    <th className="text-right px-3 py-2">Kredit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entry.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-slate-500 mr-2">{l.account.code}</span>
                        {l.account.name}
                      </td>
                      <td className="text-right px-3 py-2 font-semibold">{l.debit > 0 ? formatRupiah(l.debit) : "-"}</td>
                      <td className="text-right px-3 py-2 font-semibold">{l.credit > 0 ? formatRupiah(l.credit) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {hasDraft && postUrl && (
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={handlePost} isLoading={posting}>
              {postLabel ?? "Posting"}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
