"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

/** Hapus draft pembayaran langsung dari daftar Riwayat Pembayaran — cuma tampil kalau masih
 *  Draft (endpoint DELETE juga menolak kalau sudah posted/voided). */
export const PaymentDeleteButton: React.FC<{ paymentId: string }> = ({ paymentId }) => {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Hapus draft pembayaran ini?")) return;
    setDeleting(true);
    const res = await fetch(`/api/payments/${paymentId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || "Gagal menghapus draft pembayaran");
      return;
    }
    router.refresh();
  };

  return (
    <Button size="sm" variant="outline" className="!text-rose-700 !border-rose-300 hover:!bg-rose-50" onClick={handleDelete} isLoading={deleting}>
      Hapus
    </Button>
  );
};
