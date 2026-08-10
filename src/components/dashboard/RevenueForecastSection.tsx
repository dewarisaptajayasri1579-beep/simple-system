import { Card, CardTitle, CardDescription } from "@/components/ui";
import type { ForecastMonth } from "@/lib/revenue-forecast";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0, notation: "compact" }).format(amount);
}

function formatRupiahFull(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

const LEGEND: { key: "domain" | "server" | "maintenance" | "project"; label: string; barClass: string; dotClass: string }[] = [
  { key: "domain", label: "Domain", barClass: "bg-sky-500", dotClass: "bg-sky-500" },
  { key: "server", label: "Server", barClass: "bg-violet-500", dotClass: "bg-violet-500" },
  { key: "maintenance", label: "Maintenance", barClass: "bg-fuchsia-500", dotClass: "bg-fuchsia-500" },
  { key: "project", label: "Tagihan Project", barClass: "bg-indigo-500", dotClass: "bg-indigo-500" },
];

const BAR_MAX_HEIGHT = 180;

/** Grafik batang bertumpuk (stacked) prediksi pendapatan per bulan — dari siklus renewal
 *  Domain/Server/Maintenance + jadwal termin Project yang jatuh tempo. Ini estimasi kasar
 *  (bukan angka pasti), asumsi semua item yang aktif sekarang tetap diperpanjang tepat waktu —
 *  tujuannya kasih gambaran arus kas ke depan, bukan laporan keuangan resmi. */
export const RevenueForecastSection: React.FC<{ months: ForecastMonth[] }> = ({ months }) => {
  const maxTotal = Math.max(1, ...months.map((m) => m.total));

  return (
    <Card variant="panel" padding="lg">
      <CardTitle>Prediksi Pendapatan per Bulan</CardTitle>
      <CardDescription>
        Estimasi dari siklus renewal Domain/Server/Maintenance yang aktif + jadwal termin Project — asumsi diperpanjang tepat waktu, bukan angka pasti.
      </CardDescription>

      <div className="mt-6 flex items-end gap-3 sm:gap-5 overflow-x-auto pb-2" style={{ minHeight: BAR_MAX_HEIGHT + 60 }}>
        {months.map((m) => (
          <div key={m.monthKey} className="flex flex-col items-center gap-2 flex-shrink-0 w-16 sm:w-20">
            <p className="text-[10px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">{m.total > 0 ? formatRupiah(m.total) : "-"}</p>
            <div className="w-full flex flex-col-reverse rounded-lg overflow-hidden bg-slate-100" style={{ height: BAR_MAX_HEIGHT }} title={formatRupiahFull(m.total)}>
              {LEGEND.map(({ key, barClass }) => {
                const value = m[key];
                if (value <= 0) return null;
                const height = Math.max(2, (value / maxTotal) * BAR_MAX_HEIGHT);
                return <div key={key} className={barClass} style={{ height }} title={`${key}: ${formatRupiahFull(value)}`} />;
              })}
            </div>
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 whitespace-nowrap capitalize">{m.label}</p>
          </div>
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
    </Card>
  );
};
