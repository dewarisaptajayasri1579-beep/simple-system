"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription, Button, Alert, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui";
import { StatusBadge, type StatusBadgeType } from "@/components/ui/StatusBadge";

export interface ScheduleRow {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  paid: number;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export const ProjectScheduleTable: React.FC<{ projectId: string; rows: ScheduleRow[] }> = ({ projectId, rows }) => {
  const router = useRouter();
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async (scheduleId: string) => {
    setGenerating(scheduleId);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/schedules/${scheduleId}/generate-invoice`, { method: "POST" });
    const data = await res.json().catch(() => null);
    setGenerating(null);
    if (!res.ok) {
      setError(data?.error || "Gagal generate invoice");
      return;
    }
    router.refresh();
  };

  return (
    <Card variant="panel" padding="none">
      <div className="p-5 sm:p-6">
        <CardTitle>Jadwal Pembayaran</CardTitle>
        <CardDescription>{rows.length} termin</CardDescription>
      </div>
      {error && (
        <div className="px-5 sm:px-6 pb-4">
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        </div>
      )}
      <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Termin</TableHead>
              <TableHead>Tgl Penagihan</TableHead>
              <TableHead>Nominal Tagih</TableHead>
              <TableHead>Dibayar</TableHead>
              <TableHead>Sisa Tagih</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const remaining = Math.max(0, r.amount - r.paid);
              const status: StatusBadgeType = !r.invoiceId ? "draft" : remaining <= 0 ? "paid" : r.paid > 0 ? "partial" : "unpaid";
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.label}</TableCell>
                  <TableCell>{formatDate(r.dueDate)}</TableCell>
                  <TableCell>{formatRupiah(r.amount)}</TableCell>
                  <TableCell>{formatRupiah(r.paid)}</TableCell>
                  <TableCell className="font-semibold">{formatRupiah(remaining)}</TableCell>
                  <TableCell>
                    <StatusBadge type={status} size="sm" label={!r.invoiceId ? "Belum Ditagih" : undefined} />
                  </TableCell>
                  <TableCell>
                    {r.invoiceId ? (
                      <Link href={`/penjualan/${r.invoiceId}`} className="text-sm font-semibold text-slate-700 hover:underline">
                        {r.invoiceNumber}
                      </Link>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => handleGenerate(r.id)} isLoading={generating === r.id}>
                        Generate Invoice Sekarang
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
};
