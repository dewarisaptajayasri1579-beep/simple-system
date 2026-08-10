"use client";

import { useState } from "react";
import { Card, CardTitle, CardDescription, Table, TableContainer, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui";
import type { ForecastMonth } from "@/lib/revenue-forecast";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact" }).format(amount);
}

function formatRupiahFull(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatDateShort(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

const LEGEND: { key: "domain" | "server" | "maintenance" | "project"; label: string; barClass: string; dotClass: string }[] = [
  { key: "domain", label: "Domain", barClass: "bg-sky-500", dotClass: "bg-sky-500" },
  { key: "server", label: "Server", barClass: "bg-violet-500", dotClass: "bg-violet-500" },
  { key: "maintenance", label: "Maintenance", barClass: "bg-fuchsia-500", dotClass: "bg-fuchsia-500" },
  { key: "project", label: "Tagihan Project", barClass: "bg-indigo-500", dotClass: "bg-indigo-500" },
];

// Urutan khusus buat tabel breakdown di bawah grafik (beda dari urutan LEGEND di atas) — diminta
// tampil Maintenance, Server, Domain, baru Tagihan Project.
const TABLE_ORDER: (typeof LEGEND)[number]["key"][] = ["maintenance", "server", "domain", "project"];

const BAR_MAX_HEIGHT = 180;

/** Grafik batang bertumpuk (stacked) prediksi pendapatan per bulan — dari siklus renewal
 *  Domain/Server/Maintenance + jadwal termin Project yang jatuh tempo. Default 12 bulan/1 tahun
 *  ke depan (lihat MONTHS_AHEAD di revenue-forecast.ts). Klik 1 batang buat lihat breakdown
 *  kategorinya di tabel bawah. Ini estimasi kasar (bukan angka pasti), asumsi semua item yang
 *  aktif sekarang tetap diperpanjang tepat waktu — tujuannya kasih gambaran arus kas ke depan,
 *  bukan laporan keuangan resmi. */
export const RevenueForecastSection: React.FC<{ months: ForecastMonth[] }> = ({ months }) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const maxTotal = Math.max(1, ...months.map((m) => m.total));

  // "Passive Income" di sini = Domain + Server + Maintenance (pendapatan renewal berulang) —
  // SENGAJA tidak ikut "project" (Tagihan Project termin), karena itu pendapatan dari kerjaan
  // aktif/one-off, bukan langganan berulang yang sifatnya pasif.
  const passiveIncomeTotal = months.reduce((sum, m) => sum + m.domain + m.server + m.maintenance, 0);
  const avgPerMonth = months.length > 0 ? passiveIncomeTotal / months.length : 0;

  const selectedMonth = months.find((m) => m.monthKey === selectedKey) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card variant="feature" padding="md">
          <CardDescription>Total Estimasi Pendapatan Passive Income ({months.length} Bulan ke Depan)</CardDescription>
          <p className="text-2xl font-black text-emerald-700 mt-1">{formatRupiahFull(passiveIncomeTotal)}</p>
        </Card>
        <Card variant="feature" padding="md">
          <CardDescription>Rata-rata per Bulan</CardDescription>
          <p className="text-2xl font-black text-slate-900 mt-1">{formatRupiahFull(avgPerMonth)}</p>
        </Card>
      </div>

      <Card variant="panel" padding="lg">
        <CardTitle>Prediksi Pendapatan per Bulan</CardTitle>
        <CardDescription>
          Estimasi dari siklus renewal Domain/Server/Maintenance yang aktif + jadwal termin Project — asumsi diperpanjang tepat waktu, bukan angka
          pasti. Klik salah satu batang untuk lihat rincian per kategori.
        </CardDescription>

        <div className="mt-6 flex items-end gap-3 sm:gap-5 overflow-x-auto pb-2" style={{ minHeight: BAR_MAX_HEIGHT + 60 }}>
          {months.map((m) => (
            <button
              key={m.monthKey}
              type="button"
              onClick={() => setSelectedKey((prev) => (prev === m.monthKey ? null : m.monthKey))}
              className="flex flex-col items-center gap-2 flex-shrink-0 w-16 sm:w-20 cursor-pointer group"
            >
              <p className="text-[10px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">{m.total > 0 ? formatRupiah(m.total) : "-"}</p>
              <div
                className={`w-full flex flex-col-reverse rounded-lg overflow-hidden bg-slate-100 ring-offset-2 transition-shadow ${
                  selectedKey === m.monthKey ? "ring-2 ring-[#0544cc]" : "group-hover:ring-2 group-hover:ring-slate-300"
                }`}
                style={{ height: BAR_MAX_HEIGHT }}
                title={formatRupiahFull(m.total)}
              >
                {LEGEND.map(({ key, label, barClass }) => {
                  const value = m[key];
                  if (value <= 0) return null;
                  const height = Math.max(2, (value / maxTotal) * BAR_MAX_HEIGHT);
                  return <div key={key} className={barClass} style={{ height }} title={`${label} ${formatRupiah(value)}`} />;
                })}
              </div>
              <p
                className={`text-[10px] sm:text-xs font-semibold whitespace-nowrap capitalize ${
                  selectedKey === m.monthKey ? "text-[#0544cc]" : "text-slate-500"
                }`}
              >
                {m.label}
              </p>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 pt-4 border-t border-slate-200/60">
          {LEGEND.map(({ key, label, dotClass }) => (
            <div key={key} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
              {label}
            </div>
          ))}
        </div>

        {selectedMonth && (
          <div className="mt-6 pt-6 border-t border-slate-200/60">
            <div className="flex items-center justify-between mb-3">
              <CardTitle>Rincian {selectedMonth.label}</CardTitle>
              <button type="button" onClick={() => setSelectedKey(null)} className="text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">
                Tutup ✕
              </button>
            </div>
            <TableContainer className="rounded-none border-x-0 shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Estimasi Pendapatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TABLE_ORDER.flatMap((key) =>
                    selectedMonth.items
                      .filter((it) => it.category === key)
                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  ).map((item, i) => {
                    const legend = LEGEND.find((l) => l.key === item.category)!;
                    return (
                      <TableRow key={`${item.category}-${item.date}-${item.name}-${i}`}>
                        <TableCell className="text-slate-500">{i + 1}</TableCell>
                        <TableCell>{formatDateShort(item.date)}</TableCell>
                        <TableCell className="font-semibold">{item.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${legend.dotClass}`} />
                            {legend.label}
                          </div>
                        </TableCell>
                        <TableCell>{formatRupiahFull(item.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {selectedMonth.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                        Tidak ada estimasi pendapatan di bulan ini.
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={4} className="font-black text-slate-900">
                      Total
                    </TableCell>
                    <TableCell className="font-black text-slate-900">{formatRupiahFull(selectedMonth.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        )}
      </Card>
    </div>
  );
};
