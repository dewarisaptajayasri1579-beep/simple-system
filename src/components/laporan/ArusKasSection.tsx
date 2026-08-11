"use client";

import { useState } from "react";
import { Card, CardTitle, CardDescription, StatusBadge, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui";
import type { CashflowWeek, CashflowItem, CashflowStatus } from "@/lib/cashflow-forecast";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

const CATEGORY_LABEL: Record<CashflowItem["category"], string> = {
  domain: "Domain",
  server: "Server",
  maintenance: "Maintenance",
  project: "Termin Project",
  piutang: "Piutang",
  biaya_berkala: "Biaya Berkala",
};

const STATUS_BADGE: Record<CashflowStatus, { type: "expiring_this_month" | "expiring_next_month" | "paid"; label: string }> = {
  belum_ditagih: { type: "expiring_this_month", label: "Belum Ditagih" },
  sudah_ditagih: { type: "expiring_next_month", label: "Sudah Ditagih" },
  lunas: { type: "paid", label: "Lunas" },
};

function StatusPill({ status }: { status: CashflowStatus | null }) {
  if (!status) return <span className="text-slate-400">-</span>;
  const cfg = STATUS_BADGE[status];
  return <StatusBadge type={cfg.type} label={cfg.label} size="sm" />;
}

export const ArusKasSection: React.FC<{ weeks: CashflowWeek[] }> = ({ weeks }) => {
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  const currentBalance = weeks[0]?.openingBalance ?? 0;
  const negativeWeeks = weeks.filter((w) => w.closingBalance < 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card variant="feature" padding="md">
          <CardDescription>Saldo Kas & Bank Saat Ini</CardDescription>
          <p className="text-2xl font-black text-slate-900 mt-1">{formatRupiah(currentBalance)}</p>
        </Card>
        <Card variant="feature" padding="md">
          <CardDescription>Minggu dengan Proyeksi Saldo Minus</CardDescription>
          <p className={`text-2xl font-black mt-1 ${negativeWeeks > 0 ? "text-rose-700" : "text-emerald-700"}`}>{negativeWeeks}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {weeks.map((week) => {
          const isExpanded = expandedWeek === week.weekStart;
          const netPositive = week.net >= 0;
          const incomeItems = week.items.filter((i) => i.direction === "in").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const expenseItems = week.items.filter((i) => i.direction === "out").sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return (
            <Card key={week.weekStart} variant="panel" padding="md" className="flex flex-col gap-3">
              <button type="button" onClick={() => setExpandedWeek(isExpanded ? null : week.weekStart)} className="text-left">
                <CardTitle className="text-base">{week.label}</CardTitle>
                <CardDescription className="mt-0.5">Saldo Awal: {formatRupiah(week.openingBalance)}</CardDescription>
              </button>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Masuk</span>
                  <span className="font-bold text-emerald-700">+{formatRupiah(week.income)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Keluar</span>
                  <span className="font-bold text-rose-700">-{formatRupiah(week.expense)}</span>
                </div>
              </div>

              <StatusBadge type={netPositive ? "safe" : "expired"} label={`${netPositive ? "+" : ""}${formatRupiah(week.net)}`} size="sm" />

              <div className="pt-2 border-t border-slate-200/60">
                <p className="text-xs text-slate-500 font-medium">Saldo Akhir</p>
                <p className={`text-lg font-black ${week.closingBalance >= 0 ? "text-slate-900" : "text-rose-700"}`}>{formatRupiah(week.closingBalance)}</p>
              </div>

              <button
                type="button"
                onClick={() => setExpandedWeek(isExpanded ? null : week.weekStart)}
                className="text-xs font-bold text-blue-700 hover:text-blue-800 text-left"
              >
                {isExpanded ? "Sembunyikan rincian" : "Lihat rincian"}
              </button>

              {isExpanded && (
                <div className="space-y-4 pt-1">
                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase mb-1.5">Pemasukan</p>
                    {incomeItems.length === 0 ? (
                      <p className="text-xs text-slate-400">Tidak ada.</p>
                    ) : (
                      <TableContainer>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tanggal</TableHead>
                              <TableHead>Nama</TableHead>
                              <TableHead>Kategori</TableHead>
                              <TableHead>Estimasi</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {incomeItems.map((item, i) => (
                              <TableRow key={i}>
                                <TableCell className="whitespace-nowrap text-xs">{formatDateShort(item.date)}</TableCell>
                                <TableCell className="text-xs">{item.name}</TableCell>
                                <TableCell className="text-xs">{CATEGORY_LABEL[item.category]}</TableCell>
                                <TableCell className="text-xs font-bold text-emerald-700">{formatRupiah(item.amount)}</TableCell>
                                <TableCell>
                                  <StatusPill status={item.status} />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-600 uppercase mb-1.5">Pengeluaran</p>
                    {expenseItems.length === 0 ? (
                      <p className="text-xs text-slate-400">Tidak ada.</p>
                    ) : (
                      <TableContainer>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tanggal</TableHead>
                              <TableHead>Nama</TableHead>
                              <TableHead>Estimasi</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expenseItems.map((item, i) => (
                              <TableRow key={i}>
                                <TableCell className="whitespace-nowrap text-xs">{formatDateShort(item.date)}</TableCell>
                                <TableCell className="text-xs">{item.name}</TableCell>
                                <TableCell className="text-xs font-bold text-rose-700">{formatRupiah(item.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
