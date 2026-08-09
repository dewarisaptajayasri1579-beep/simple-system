"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JournalButton } from "@/components/akuntansi/JournalButton";
import { VoidButton } from "@/components/akuntansi/VoidButton";

interface ExistingTransaction {
  id: string;
  postStatus: "draft" | "posted" | "voided";
  journalEntryId: string | null;
}

/** Bayar biaya berkala dari Dashboard — "Bayar Sekarang" mengarahkan ke Kas Keluar dengan
 *  baris "Biaya Berkala" ini sudah terisi (lihat prefill di KasKeluarPanel via ?recurringBillId),
 *  supaya satu-satunya jalur input pengeluaran cuma Kas Keluar (nomor bukti/jurnalnya konsisten
 *  sama pengeluaran lain). Begitu ada Transaction (draft/posted) untuk biaya ini, baris ini
 *  nunjukin status + "Lihat Jurnal" + aksi lanjutan (Posting/Hapus kalau draft, Batalkan kalau
 *  sudah posted) — sama persis pola yang dipakai di Pembayaran/Kas Keluar. */
export const RecurringBillPaymentCell: React.FC<{ billId: string; billName: string }> = ({ billId, billName }) => {
  const router = useRouter();
  const [existing, setExisting] = useState<ExistingTransaction | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    fetch(`/api/transactions?refType=recurring_bill&refId=${billId}`)
      .then((r) => r.json())
      .then((rows: ExistingTransaction[]) => {
        const active = rows.find((t) => t.postStatus !== "voided");
        setExisting(active ?? null);
      })
      .catch(() => setExisting(null));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId]);

  const handlePostExisting = async () => {
    if (!existing) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/transactions/${existing.id}/post`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error || "Gagal posting");
      return;
    }
    load();
    router.refresh();
  };

  const handleDeleteDraft = async () => {
    if (!existing) return;
    if (!confirm("Hapus draft transaksi ini?")) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/transactions/${existing.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Gagal menghapus draft");
      return;
    }
    load();
    router.refresh();
  };

  if (existing === undefined) return null;

  if (existing) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        {error && (
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge type={existing.postStatus} size="sm" />
          <JournalButton
            title={`Jurnal — ${billName}`}
            sources={existing.journalEntryId ? [{ entryId: existing.journalEntryId }] : [{ sourceType: "recurring_bill", sourceId: billId }]}
            postUrl={existing.postStatus === "draft" ? `/api/transactions/${existing.id}/post` : undefined}
          />
          {existing.postStatus === "draft" && (
            <>
              <Button size="sm" variant="primary" onClick={handlePostExisting} isLoading={busy}>
                Posting
              </Button>
              <Button size="sm" variant="outline" className="!text-rose-700 !border-rose-300 hover:!bg-rose-50" onClick={handleDeleteDraft} isLoading={busy}>
                Hapus
              </Button>
            </>
          )}
          {existing.postStatus === "posted" && (
            <VoidButton voidUrl={`/api/transactions/${existing.id}/void`} itemLabel={`pembayaran ${billName}`} onVoided={load} />
          )}
        </div>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => router.push(`/keuangan/kas-keluar?recurringBillId=${billId}`)}>
      Bayar Sekarang
    </Button>
  );
};
