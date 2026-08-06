"use client";

import React from "react";
import Link from "next/link";
import { Card, CardTitle, CardDescription, Button, FilterableTable, type FilterableColumn } from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";

export interface PiutangInvoice {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  status: string;
  dueDate: string | null;
  paid: number;
  remaining: number;
}

export interface PiutangClientGroup {
  clientId: string;
  clientName: string;
  picName: string | null;
  picPhone: string | null;
  invoices: PiutangInvoice[];
  totalRemaining: number;
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

const PIUTANG_STATUS_OPTIONS = [
  { value: "unpaid", label: "Belum Dibayar" },
  { value: "partial", label: "Dicicil" },
  { value: "claimed_paid", label: "Diklaim Lunas" },
];

function getInvoiceColumns(clientId: string): FilterableColumn<PiutangInvoice>[] {
  return [
    {
      key: "invoiceNumber",
      header: "No. Invoice",
      filterValue: (inv) => inv.invoiceNumber,
      cellClassName: "font-semibold",
      cell: (inv) => (
        <Link href={`/penjualan/${inv.id}`} className="hover:underline">
          {inv.invoiceNumber}
        </Link>
      ),
    },
    { key: "dueDate", header: "Jatuh Tempo", cell: (inv) => formatDate(inv.dueDate) },
    { key: "totalAmount", header: "Total", cell: (inv) => formatRupiah(inv.totalAmount) },
    { key: "remaining", header: "Sisa", cellClassName: "font-semibold", cell: (inv) => formatRupiah(inv.remaining) },
    {
      key: "status",
      header: "Status",
      filterValue: (inv) => inv.status,
      filterOptions: PIUTANG_STATUS_OPTIONS,
      cell: (inv) => <StatusBadge type={inv.status as StatusBadgeType} size="sm" />,
    },
    {
      key: "aksi",
      header: "Aksi",
      cell: (inv) => (
        <Link href={`/pembayaran?clientId=${clientId}&invoiceId=${inv.id}`}>
          <Button size="sm" variant="outline">
            Bayar
          </Button>
        </Link>
      ),
    },
  ];
}

export const PiutangList: React.FC<{ groups: PiutangClientGroup[] }> = ({ groups }) => {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <Card key={group.clientId} variant="panel" padding="none">
          <div className="p-5 sm:p-6 flex items-center justify-between gap-4">
            <div>
              <CardTitle>{group.clientName}</CardTitle>
              <CardDescription>{group.invoices.length} invoice belum lunas</CardDescription>
              {(group.picName || group.picPhone) && (
                <p className="text-xs text-slate-500 font-medium mt-1">
                  PIC: {group.picName ?? "-"} · No. WA PIC: {group.picPhone ?? "-"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <p className="text-lg font-black text-rose-700">{formatRupiah(group.totalRemaining)}</p>
              <Link href={`/pembayaran?clientId=${group.clientId}`}>
                <Button size="sm" variant="primary">
                  Bayar
                </Button>
              </Link>
            </div>
          </div>
          <FilterableTable columns={getInvoiceColumns(group.clientId)} rows={group.invoices} rowKey={(inv) => inv.id} />
        </Card>
      ))}

      {groups.length === 0 && (
        <Card variant="feature" padding="lg">
          <p className="text-center text-slate-500">Tidak ada piutang terbuka. Semua invoice sudah lunas.</p>
        </Card>
      )}
    </div>
  );
};
