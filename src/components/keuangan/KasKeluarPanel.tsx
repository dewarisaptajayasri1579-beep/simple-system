"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, Alert, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AccountOption } from "./AccountPicker";
import { KasKeluarRowActions } from "./KasKeluarRowActions";
import { ChevronLeft, Plus } from "lucide-react";
import { type BillItemOption, formatRupiah } from "./kasKeluarShared";

interface TransactionRow {
  id: string;
  transactionNumber: string | null;
  grossAmount: number;
  description: string | null;
  occurredAt: string;
  postStatus: "draft" | "posted" | "voided";
  refType: string | null;
  refId: string | null;
  paymentId: string | null;
  journalEntryId: string | null;
  accountId: string;
  categoryId: string | null;
  account: { name: string };
  category: { name: string } | null;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Kas Keluar — satu pintu buat semua pengeluaran kas/bank, termasuk yang dulu dua menu
 *  terpisah "Bayar Domain"/"Bayar Server" (sekarang jadi salah satu Tipe baris di form).
 *  Riwayat ditaruh di ATAS (paling sering dilihat/dicek ulang) — input-nya di halaman
 *  terpisah (/kas-keluar/baru), supaya list-nya tidak ke-geser jauh ke bawah tiap kali form
 *  diisi banyak baris. (Sempat dicoba juga versi modal untuk dibandingkan — hasilnya halaman
 *  terpisah yang dipakai, lihat KasKeluarForm.tsx/KasKeluarNewPagePanel.tsx.)
 *  domains/servers/maintenances/recurringBills di sini CUMA buat resolve nama di kolom
 *  Keterangan Riwayat (baris refType domain/server/dst) — bukan buat form lagi. */
export const KasKeluarPanel: React.FC<{
  domains: BillItemOption[];
  servers: BillItemOption[];
  maintenances: BillItemOption[];
  recurringBills: BillItemOption[];
}> = ({ domains, servers, maintenances, recurringBills }) => {
  const [rows, setRows] = useState<TransactionRow[] | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    fetch(`/api/transactions?type=expense`)
      .then((r) => r.json())
      .then((data: TransactionRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setError("Gagal memuat riwayat"));
  };

  useEffect(() => {
    load();
    window.addEventListener("transactions-changed", load);
    return () => window.removeEventListener("transactions-changed", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameByRefId = new Map<string, string>();
  for (const d of domains) nameByRefId.set(d.id, d.name);
  for (const s of servers) nameByRefId.set(s.id, s.name);
  for (const m of maintenances) nameByRefId.set(m.id, m.name);
  for (const b of recurringBills) nameByRefId.set(b.id, b.name);

  const REF_LABEL: Record<string, string> = {
    domain: "Bayar Domain",
    server: "Bayar Server",
    maintenance: "Bayar Maintenance",
    recurring_bill: "Bayar Biaya Berkala",
    kasbon: "Kasbon",
  };

  const rowLabel = (r: TransactionRow) => {
    if (r.refType && r.refId) return `${REF_LABEL[r.refType] ?? r.refType} — ${nameByRefId.get(r.refId) ?? "-"}`;
    return r.description || r.category?.name || "-";
  };

  const columns: FilterableColumn<TransactionRow>[] = [
    {
      key: "transactionNumber",
      header: "No. Bukti",
      filterValue: (r) => r.transactionNumber ?? "",
      cellClassName: "font-semibold",
      cell: (r) => (
        <Link href={`/keuangan/transaksi/${r.id}`} className="hover:underline">
          {r.transactionNumber ?? "-"}
        </Link>
      ),
    },
    { key: "occurredAt", header: "Tanggal", cell: (r) => formatDate(r.occurredAt) },
    { key: "description", header: "Keterangan", cellClassName: "font-semibold", filterValue: rowLabel, cell: rowLabel },
    { key: "account", header: "Akun", cell: (r) => r.account.name },
    { key: "amount", header: "Jumlah", cellClassName: "font-semibold", cell: (r) => formatRupiah(r.grossAmount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge type={r.postStatus} size="sm" /> },
    {
      key: "aksi",
      header: "Aksi",
      cell: (r) => (
        <KasKeluarRowActions
          transactionId={r.id}
          transactionNumber={r.transactionNumber ?? "-"}
          journalSource={r.journalEntryId ? { entryId: r.journalEntryId } : { sourceType: r.refType ?? "transaction", sourceId: r.refType && r.refId ? r.refId : r.id }}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/keuangan" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
            <ChevronLeft className="w-3.5 h-3.5" />
            Keuangan
          </Link>
          <div className="mt-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Kas Keluar</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Catat pengeluaran kas/bank — biaya manual maupun Bayar Domain/Server/Biaya Berkala, boleh lebih dari 1 baris sekaligus.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/keuangan/kas-keluar/baru">
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
              Tambah Kas Keluar
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card variant="panel" padding="none">
        <div className="p-5 sm:p-6">
          <CardTitle>Riwayat Kas Keluar</CardTitle>
          <CardDescription>{rows?.length ?? 0} transaksi</CardDescription>
        </div>
        <FilterableTable columns={columns} rows={rows ?? []} rowKey={(r) => r.id} pageSize={20} emptyMessage="Belum ada pengeluaran." mobileCardMode />
      </Card>
    </div>
  );
};
