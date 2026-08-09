"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Alert } from "@/components/ui";
import { RefreshCw } from "lucide-react";

interface Summary {
  invoicesChecked: number;
  invoicesFixed: number;
  paymentsFixed: number;
  errors: { invoiceNumber: string; error: string }[];
}

export const RecalculateJournalsButton: React.FC = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    setIsRunning(true);
    setError("");
    setSummary(null);
    try {
      const res = await fetch("/api/akuntansi/rekalkulasi", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menjalankan rekalkulasi");
        return;
      }
      setSummary(data);
      router.refresh();
    } catch {
      setError("Gagal menghubungi server");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={() => setIsOpen(true)}>
        Rekalkulasi Jurnal Akrual
      </Button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Rekalkulasi Jurnal Akrual">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cek & perbaiki jurnal Piutang/Pendapatan/HPP semua invoice berdasarkan data Invoice &amp; Pembayaran yang sebenarnya —
            berlaku otomatis untuk semua laporan akrual (Neraca Akrual, Laba Rugi Akrual, Buku Besar, COA) karena semuanya baca dari
            jurnal yang sama. Aman dijalankan berkali-kali.
          </p>

          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          {summary && (
            <div className="space-y-2 text-sm bg-slate-50 rounded-xl p-4 border border-slate-200/70">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice dicek</span>
                <span className="font-semibold">{summary.invoicesChecked}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice diperbaiki</span>
                <span className="font-semibold">{summary.invoicesFixed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Jurnal pelunasan diperbaiki</span>
                <span className="font-semibold">{summary.paymentsFixed}</span>
              </div>
              {summary.errors.length > 0 && (
                <div className="pt-2 border-t border-slate-200/60">
                  <p className="font-semibold text-rose-700 mb-1">{summary.errors.length} invoice gagal:</p>
                  <ul className="list-disc list-inside text-rose-600 text-xs space-y-0.5">
                    {summary.errors.map((e) => (
                      <li key={e.invoiceNumber}>
                        {e.invoiceNumber}: {e.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsOpen(false)}>
              Tutup
            </Button>
            <Button variant="primary" onClick={handleRun} isLoading={isRunning}>
              Jalankan Sekarang
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
