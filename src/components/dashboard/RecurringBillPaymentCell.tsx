"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Select, Input, Alert } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JournalButton } from "@/components/akuntansi/JournalButton";
import { VoidButton } from "@/components/akuntansi/VoidButton";
import { guessCategoryId } from "@/lib/category-guess";
import { jakartaTodayDateIso } from "@/lib/datetime";
import type { AccountOption } from "./MarkPaidButton";

interface ExistingTransaction {
  id: string;
  postStatus: "draft" | "posted" | "voided";
  journalEntryId: string | null;
}

/** Bayar biaya berkala langsung dari Dashboard — bikin bukti Transaction Kas/Bank Keluar
 *  lengkap (tanggal, akun, kategori otomatis), bisa disimpan Draft atau langsung Posting.
 *  Begitu ada Transaction (draft/posted) untuk biaya ini, baris ini nunjukin status + "Lihat
 *  Jurnal" + aksi lanjutan (Posting/Hapus kalau draft, Batalkan kalau sudah posted) — sama
 *  persis pola yang dipakai di Pembayaran. Saat di-posting, `lastPaidAt` biaya ini otomatis
 *  ke-update jadi tanggal transaksi yang diisi di sini (bukan tanggal hari ini). */
export const RecurringBillPaymentCell: React.FC<{ billId: string; billName: string; accounts: AccountOption[] }> = ({
  billId,
  billName,
  accounts,
}) => {
  const router = useRouter();
  const [existing, setExisting] = useState<ExistingTransaction | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(jakartaTodayDateIso());
  const [categoryId, setCategoryId] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [categoryAuto, setCategoryAuto] = useState(false);
  const [saving, setSaving] = useState<"draft" | "posting" | null>(null);
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

  useEffect(() => {
    if (!open) return;
    fetch("/api/categories?kind=expense")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const options = data.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }));
        setCategoryOptions(options);
        const guess = guessCategoryId(billName, options);
        if (guess) {
          setCategoryId(guess);
          setCategoryAuto(true);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCreateCategory = async (name: string) => {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind: "expense" }),
    });
    const cat = await res.json().catch(() => null);
    if (!res.ok || !cat?.id) return null;
    const newOption = { value: cat.id as string, label: cat.name as string };
    setCategoryOptions((prev) => (prev.some((o) => o.value === newOption.value) ? prev : [...prev, newOption]));
    return newOption;
  };

  const openModal = () => {
    setAccountId(accounts[0]?.id ?? "");
    setOccurredAt(jakartaTodayDateIso());
    setCategoryId("");
    setCategoryAuto(false);
    setError("");
    setOpen(true);
  };

  const handleSubmit = async (mode: "draft" | "posting") => {
    if (!accountId) {
      setError("Pilih akun kas/bank dulu");
      return;
    }
    setSaving(mode);
    setError("");
    const res = await fetch(`/api/recurring-bills/${billId}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, paidAt: occurredAt, categoryId: categoryId || undefined }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setSaving(null);
      setError(data?.error || "Gagal menyimpan transaksi");
      return;
    }
    if (mode === "posting") {
      const postRes = await fetch(`/api/transactions/${data.transaction.id}/post`, { method: "POST" });
      const postData = await postRes.json().catch(() => null);
      if (!postRes.ok) {
        setSaving(null);
        setError(postData?.error || "Transaksi tersimpan sebagai draft, tapi gagal diposting");
        load();
        return;
      }
    }
    setSaving(null);
    setOpen(false);
    load();
    router.refresh();
  };

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
    <>
      <Button size="sm" variant="outline" onClick={openModal}>
        Bayar Sekarang
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Bayar Biaya Berkala" subtitle={billName}>
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <Input label="Tanggal Transaksi" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <Select
            label="Bayar dari Akun"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={accountId}
            onChange={setAccountId}
            placeholder="Pilih Kas/Bank"
          />
          <div>
            <Select
              label="Kategori (opsional)"
              options={categoryOptions}
              value={categoryId}
              onChange={(v) => {
                setCategoryId(v);
                setCategoryAuto(false);
              }}
              placeholder="Pilih atau tambah kategori"
              searchPlaceholder="Cari atau ketik untuk tambah..."
              emptyText="Belum ada, ketik untuk menambah"
              creatable
              onCreateOption={handleCreateCategory}
              createOptionLabel={(q) => `Tambah "${q}"`}
            />
            {categoryAuto && categoryId && (
              <p className="text-xs font-semibold text-blue-600 mt-1.5">Terdeteksi otomatis dari nama biaya — ganti kalau salah</p>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="outline" onClick={() => handleSubmit("draft")} isLoading={saving === "draft"} disabled={saving === "posting"}>
              Simpan Draft
            </Button>
            <Button variant="primary" onClick={() => handleSubmit("posting")} isLoading={saving === "posting"} disabled={saving === "draft"}>
              Posting
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
