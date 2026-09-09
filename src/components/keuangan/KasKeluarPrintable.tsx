import Image from "next/image";
import { Card } from "@/components/ui";
import { terbilangRupiah } from "@/lib/terbilang";
import { Wallet, FileText, Landmark, User, Hash, Calendar } from "lucide-react";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

/** Format cetak "Bukti Kas Keluar"/"Bukti Kas Masuk" — dipicu dari dropdown Aksi Kas Keluar
 *  (lihat KasKeluarRowActions "Cetak Bukti Kas" + AutoPrint) atau tombol Cetak manual di halaman
 *  detail transaksi. Sama pola dengan KwitansiPrintable (.print-only, cuma tampil saat
 *  window.print()), kertas A5 landscape (lihat @page di globals.css — dipakai bareng semua
 *  format cetak lain, sengaja tidak dibuat scoped per halaman). */
export const KasKeluarPrintable: React.FC<{
  transactionNumber: string;
  type: "income" | "expense";
  occurredAt: string;
  label: string;
  accountName: string;
  categoryName?: string | null;
  grossAmount: number;
  createdByName: string | null;
  postStatus: "draft" | "posted" | "voided";
}> = ({ transactionNumber, type, occurredAt, label, accountName, categoryName, grossAmount, createdByName, postStatus }) => {
  const title = type === "income" ? "BUKTI KAS MASUK" : "BUKTI KAS KELUAR";

  return (
    <div className="print-only">
      <Card variant="panel" padding="sm" className="relative overflow-hidden print:shadow-none print:border-none print:bg-white print-nota-a5">
        {postStatus !== "posted" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 print-exact-color">
            <span className="text-2xl font-black text-rose-600/40 uppercase tracking-widest -rotate-[25deg] border-4 border-rose-600/40 rounded-2xl px-6 py-2 whitespace-nowrap">
              {postStatus === "draft" ? "Draft — Belum Sah" : "Dibatalkan"}
            </span>
          </div>
        )}

        <div className="print-exact-color">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <Image src="/nota/logo-7smarts.png" alt="7Smarts" width={160} height={53} className="h-9 w-auto" priority />
            <div className="flex flex-col items-end gap-2">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{title}</p>
              <div className="flex items-stretch">
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="w-7 h-7 rounded-md border border-[#0544cc] flex items-center justify-center flex-shrink-0">
                    <Hash className="w-3.5 h-3.5 text-[#0544cc]" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[10px] text-slate-500 font-semibold">No.</p>
                    <p className="text-xs font-black text-slate-900">{transactionNumber}</p>
                  </div>
                </div>
                <div className="w-px bg-slate-200" />
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="w-7 h-7 rounded-md border border-[#0544cc] flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-[#0544cc]" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[10px] text-slate-500 font-semibold">Tanggal</p>
                    <p className="text-xs font-black text-slate-900">{formatDate(occurredAt)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 divide-y divide-dashed divide-slate-200">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FileText className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 w-32 flex-shrink-0">Keterangan</span>
            <span className="text-sm font-black text-slate-900">{label}</span>
          </div>
          {categoryName && (
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-[#0544cc]" />
              </div>
              <span className="text-[11px] font-semibold text-slate-500 w-32 flex-shrink-0">Kategori</span>
              <span className="text-sm font-bold text-slate-700">{categoryName}</span>
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 w-32 flex-shrink-0">Uang sejumlah</span>
            <span className="text-sm font-bold italic text-[#0544cc]">{terbilangRupiah(grossAmount)}</span>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-[#0544cc] flex items-center overflow-hidden print-exact-color">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-white/10">
            <span className="text-xs font-black text-white uppercase tracking-wide">Jumlah</span>
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-black text-[#0544cc]">Rp</span>
            </div>
          </div>
          <div className="flex-1 px-4 text-right">
            <span className="text-xl font-black text-white">{formatRupiah(grossAmount)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 print-exact-color">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Landmark className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <div className="leading-tight">
              <p className="text-[9px] font-bold text-[#0544cc] uppercase tracking-wide">Akun Kas/Bank</p>
              <p className="text-xs font-black text-slate-900">{accountName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <div className="leading-tight">
              <p className="text-[9px] font-bold text-[#0544cc] uppercase tracking-wide">Dibuat oleh</p>
              <p className="text-xs font-black text-slate-900">{createdByName ?? "-"}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
