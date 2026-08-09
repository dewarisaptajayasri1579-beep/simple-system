"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JournalButton } from "@/components/akuntansi/JournalButton";
import { VoidButton } from "@/components/akuntansi/VoidButton";
import type { JournalSource } from "@/components/akuntansi/JournalPreviewModal";

export const PaymentPostingBar: React.FC<{ paymentId: string; postStatus: "draft" | "posted" | "voided"; sources: JournalSource[] }> = ({
  paymentId,
  postStatus,
  sources,
}) => {
  const router = useRouter();
  const [status, setStatus] = useState(postStatus);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handlePost = async () => {
    setPosting(true);
    setError("");
    const res = await fetch(`/api/payments/${paymentId}/post`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setPosting(false);
    if (!res.ok) {
      setError(data?.error || "Gagal posting pembayaran");
      return;
    }
    setStatus("posted");
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirm("Hapus draft pembayaran ini? Kalau salah input, ini cara paling gampang untuk input ulang dari awal.")) return;
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/payments/${paymentId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setDeleting(false);
      setError(data?.error || "Gagal menghapus draft pembayaran");
      return;
    }
    router.push("/pembayaran");
    router.refresh();
  };

  return (
    <div className="no-print space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge type={status} size="sm" />
        <JournalButton
          title="Jurnal Pembayaran"
          sources={sources}
          postUrl={status === "draft" ? `/api/payments/${paymentId}/post` : undefined}
        />
        {status === "draft" && (
          <>
            <Button size="sm" variant="primary" onClick={handlePost} isLoading={posting}>
              Posting
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="!text-rose-700 !border-rose-300 hover:!bg-rose-50"
              onClick={handleDelete}
              isLoading={deleting}
            >
              Hapus
            </Button>
          </>
        )}
        {status === "posted" && (
          <VoidButton voidUrl={`/api/payments/${paymentId}/void`} itemLabel="pembayaran ini" onVoided={() => setStatus("voided")} />
        )}
      </div>
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
    </div>
  );
};
