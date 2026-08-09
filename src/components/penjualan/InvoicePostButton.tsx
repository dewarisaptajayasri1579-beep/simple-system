"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert } from "@/components/ui";

export interface InvoicePostButtonProps {
  invoiceId: string;
}

/** Tombol "Posting" invoice draft — sama pola dgn Payment/Transaction lain (draft belum masuk
 *  laporan/bisa dibayar). Dipasang di halaman Detail Invoice supaya jelas kelihatan kenapa
 *  "Input Pembayaran" belum bisa dipakai (form Pembayaran cuma nampilin invoice postStatus
 *  "posted" — lihat PembayaranForm.tsx). */
export const InvoicePostButton: React.FC<InvoicePostButtonProps> = ({ invoiceId }) => {
  const router = useRouter();
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const handlePost = async () => {
    setPosting(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoiceId}/post`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPosting(false);
    if (!res.ok) {
      setError(data?.error || "Gagal posting invoice");
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      <Button variant="primary" onClick={handlePost} isLoading={posting}>
        Posting Invoice
      </Button>
    </div>
  );
};
