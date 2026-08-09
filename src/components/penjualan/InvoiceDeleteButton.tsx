"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert } from "@/components/ui";

export interface InvoiceDeleteButtonProps {
  invoiceId: string;
}

/** Tombol "Hapus" invoice draft — dipasang di halaman Detail Invoice saja, bukan di daftar,
 *  supaya staf harus buka detail dulu sebelum menghapus (sama pola dgn PaymentPostingBar). */
export const InvoiceDeleteButton: React.FC<InvoiceDeleteButtonProps> = ({ invoiceId }) => {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (!confirm("Hapus draft invoice ini? Kalau salah input, ini cara paling gampang untuk input ulang dari awal.")) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setDeleting(false);
      setError(data?.error || "Gagal menghapus draft invoice");
      return;
    }
    router.push("/penjualan");
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      <Button
        size="sm"
        variant="outline"
        className="!text-rose-700 !border-rose-300 hover:!bg-rose-50"
        onClick={handleDelete}
        isLoading={deleting}
      >
        Hapus
      </Button>
    </div>
  );
};
