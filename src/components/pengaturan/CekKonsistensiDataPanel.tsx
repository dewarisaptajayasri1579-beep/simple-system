"use client";

import { useState } from "react";
import { Button, Card, CardDescription, Alert } from "@/components/ui";
import { PlayCircle } from "lucide-react";
import { ConsistencyFindingsList } from "./ConsistencyFindingsList";
import type { ConsistencyFinding } from "@/lib/data-consistency-check";

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

/** Tombol "Jalankan Pengecekan" manual — bukan auto-run tiap halaman dibuka, supaya staf yang
 *  kontrol kapan dijalankan (checks-nya bisa makin berat ke depannya). Tidak nyimpan riwayat,
 *  cuma nampilin hasil run yang paling baru. */
export const CekKonsistensiDataPanel: React.FC = () => {
  const [findings, setFindings] = useState<ConsistencyFinding[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const handleRun = async () => {
    setRunning(true);
    setError("");
    const res = await fetch("/api/pengaturan/cek-konsistensi-data", { method: "POST" });
    const data = await res.json().catch(() => null);
    setRunning(false);
    if (!res.ok) {
      setError(data?.error || "Gagal menjalankan pengecekan");
      return;
    }
    setFindings(data.findings);
    setCheckedAt(data.checkedAt);
  };

  const errorCount = findings?.filter((f) => f.severity === "error").length ?? 0;
  const warningCount = findings?.filter((f) => f.severity === "warning").length ?? 0;

  return (
    <div className="space-y-6">
      <Card variant="panel" padding="lg">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardDescription>
              {checkedAt ? `Terakhir dijalankan: ${formatDateTime(checkedAt)}` : "Belum pernah dijalankan sesi ini — klik tombol untuk mulai."}
            </CardDescription>
          </div>
          <Button variant="primary" leftIcon={<PlayCircle className="w-4 h-4" />} onClick={handleRun} isLoading={running}>
            Jalankan Pengecekan
          </Button>
        </div>
        {error && (
          <div className="mt-4">
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          </div>
        )}
      </Card>

      {findings !== null && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            <Card variant="feature" padding="md">
              <CardDescription>Total Temuan</CardDescription>
              <p className="text-2xl font-black text-slate-900 mt-1">{findings.length}</p>
            </Card>
            <Card variant="feature" padding="md">
              <CardDescription>Error</CardDescription>
              <p className="text-2xl font-black text-rose-700 mt-1">{errorCount}</p>
            </Card>
            <Card variant="feature" padding="md">
              <CardDescription>Warning</CardDescription>
              <p className="text-2xl font-black text-amber-700 mt-1">{warningCount}</p>
            </Card>
          </div>

          <ConsistencyFindingsList rows={findings} />
        </>
      )}
    </div>
  );
};
