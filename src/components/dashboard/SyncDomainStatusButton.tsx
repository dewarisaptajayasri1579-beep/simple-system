"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface SyncResult {
  checked: number;
  taggedCount: number;
  paidCount: number;
  fixed: { name: string; action: string }[];
}

/** Cek ulang status tagih/bayar tiap Domain terhadap Invoice/Payment yang senyatanya ada
 *  (lihat /api/domains/sync-billing-status) — buat nutup celah domain yang nyangkut kelihatan
 *  "belum ditagih"/"belum dibayar" padahal invoice-nya sudah ada/lunas. Domain yang ternyata
 *  sudah lunas otomatis hilang dari daftar begitu halaman di-refresh. */
export const SyncDomainStatusButton: React.FC = () => {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<SyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleClick = async () => {
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/domains/sync-billing-status", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal sinkronisasi status domain");
      setResult(data);
      setStatus("done");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Gagal sinkronisasi status domain");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={status === "loading"}>
        {status === "loading" ? "Menyinkron..." : "Sinkronisasi"}
      </Button>
      {status === "done" && result && (
        <span className="text-xs font-semibold text-emerald-600 text-right max-w-xs">
          {result.taggedCount + result.paidCount === 0
            ? `Cek ${result.checked} domain — semua sudah sinkron`
            : `Dibetulkan: ${result.taggedCount} label ditagih, ${result.paidCount} status dibayar`}
        </span>
      )}
      {status === "error" && <span className="text-xs font-semibold text-rose-600">{errorMessage}</span>}
    </div>
  );
};
