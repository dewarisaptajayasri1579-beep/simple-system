"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Card, CardTitle, CardDescription, Button, Alert, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JournalButton } from "@/components/akuntansi/JournalButton";
import { PostingConfirmButton } from "@/components/akuntansi/PostingConfirmButton";
import type { JournalSource } from "@/components/akuntansi/JournalPreviewModal";

interface TransactionRow {
  id: string;
  type: "income" | "expense";
  transactionNumber: string | null;
  grossAmount: number;
  description: string | null;
  occurredAt: string;
  postStatus: "draft" | "posted" | "voided";
  refType: string | null;
  refId: string | null;
  journalEntryId: string | null;
  paymentId: string | null;
  invoicePayment: { id: string } | null;
  account: { name: string };
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

const REF_LABEL: Record<string, string> = { server: "Bayar Server", domain: "Bayar Domain", recurring_bill: "Biaya Berkala", kasbon: "Kasbon" };

// journalEntryId = link presisi ke jurnal transaksi INI. Fallback sourceType+sourceId cuma buat
// baris lama (sebelum kolom ini ada) — itu dipakai bareng-bareng oleh SELURUH histori
// server/domain/biaya berkala yang sama, jadi bisa kebawa jurnal transaksi lain/lama yang sudah
// dibatalkan kalau dipakai buat nampilin jurnal 1 transaksi tertentu saja.
function journalSourceFor(r: TransactionRow): JournalSource {
  if (r.journalEntryId) return { entryId: r.journalEntryId };
  return { sourceType: r.refType ?? "transaction", sourceId: r.refType && r.refId ? r.refId : r.id };
}

/** Daftar Transaction draft (Input Pemasukan/Pengeluaran manual, Bayar Server/Domain, Tandai
 *  Lunas Biaya Berkala) — belum masuk saldo akun/laporan sampai di-posting di sini. Transaksi
 *  yang sudah posted sengaja TIDAK ditampilkan di panel ini (sudah ada histori lengkapnya di
 *  masing-masing menu — Kas Keluar/Kas Masuk/dst) — panel ini fokus cuma buat kerjaan yang
 *  masih perlu ditindaklanjuti (posting). Transaksi yang jadi bagian dari Pembayaran
 *  (invoice_payment) tidak muncul di sini — itu dikelola dari menu Pembayaran sendiri. */
export const DraftTransactionsPanel: React.FC = () => {
  const [draftRows, setDraftRows] = useState<TransactionRow[] | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    fetch(`/api/transactions?postStatus=draft&excludePaymentLinked=true`)
      .then((r) => r.json())
      .then(setDraftRows)
      .catch(() => setError("Gagal memuat transaksi"));
  };

  useEffect(() => {
    load();
    // KeuanganPanel (Input Pemasukan/Pengeluaran, Bayar Server/Domain/Biaya Berkala) hidup di
    // client component terpisah dan cuma panggil router.refresh() setelah simpan — itu tidak
    // memicu re-fetch client-side panel ini, jadi dengarkan event custom-nya sendiri.
    window.addEventListener("transactions-changed", load);
    return () => window.removeEventListener("transactions-changed", load);
  }, []);

  if (!draftRows) return null;

  const baseColumns: FilterableColumn<TransactionRow>[] = [
    { key: "transactionNumber", header: "No. Bukti", cell: (r) => r.transactionNumber ?? "-" },
    { key: "occurredAt", header: "Tanggal", cell: (r) => formatDate(r.occurredAt) },
    {
      key: "description",
      header: "Keterangan",
      cellClassName: "font-semibold",
      cell: (r) => r.description ?? (r.refType ? REF_LABEL[r.refType] ?? r.refType : "-"),
    },
    { key: "account", header: "Akun", cell: (r) => r.account.name },
    { key: "amount", header: "Jumlah", cell: (r) => formatRupiah(r.grossAmount) },
  ];

  const draftColumns: FilterableColumn<TransactionRow>[] = [
    ...baseColumns,
    { key: "status", header: "Status", cell: () => <StatusBadge type="draft" size="sm" /> },
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Link href={`/keuangan/transaksi/${r.id}`}>
            <Button size="sm" variant="ghost" leftIcon={<Pencil className="w-3.5 h-3.5" />}>
              Edit
            </Button>
          </Link>
          <JournalButton
            title="Jurnal Transaksi"
            sources={[journalSourceFor(r)]}
            postUrl={`/api/transactions/${r.id}/post`}
            previewKind="transaction"
            previewId={r.id}
          />
          <PostingConfirmButton previewKind="transaction" previewId={r.id} postUrl={`/api/transactions/${r.id}/post`} onPosted={load} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {draftRows.length > 0 && (
        <Card variant="panel" padding="none">
          <div className="p-5 sm:p-6">
            <CardTitle>Transaksi Draft</CardTitle>
            <CardDescription>{draftRows.length} transaksi belum diposting — belum masuk saldo akun/laporan.</CardDescription>
          </div>
          <FilterableTable columns={draftColumns} rows={draftRows} rowKey={(r) => r.id} />
        </Card>
      )}
    </div>
  );
};
