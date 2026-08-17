import { Card } from "@/components/ui";
import { KwitansiHeader } from "./KwitansiHeader";
import { terbilangRupiah } from "@/lib/terbilang";
import { User, FileText, Wallet, Landmark, UserCheck, ShieldCheck } from "lucide-react";
import type { Payment, InvoicePayment, Invoice, Client, Account } from "@prisma/client";

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

/** Format cetak Kwitansi — hanya render saat print (lihat .print-only di globals.css), meniru
 *  persis referensi "Kwitansi Keren" (nota/Kwitansi Keren.png). Ukuran kertas A5 landscape, sama
 *  dengan cetak Invoice (lihat @page & .print-nota-a5 di globals.css). Tampilan layar sehari-hari
 *  staf tetap yang lama, tidak disentuh — ini cuma dipakai saat window.print() dipanggil. */
export const KwitansiPrintable: React.FC<{
  payment: Payment & { client: Client; account: Account; invoicePayments: (InvoicePayment & { invoice: Invoice })[] };
  receiverName: string;
  date: string;
  qrDataUrl?: string;
  isFullyPaid: boolean;
}> = ({ payment, receiverName, date, qrDataUrl, isFullyPaid }) => {
  const untukPembayaran = payment.invoicePayments.map((ip) => ip.invoice.invoiceNumber).join(", ");

  return (
    <div className="print-only">
      <Card variant="panel" padding="sm" className="relative overflow-hidden print:shadow-none print:border-none print:bg-white print-nota-a5">
        {payment.postStatus === "draft" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 print-exact-color">
            <span className="text-2xl font-black text-rose-600/40 uppercase tracking-widest -rotate-[25deg] border-4 border-rose-600/40 rounded-2xl px-6 py-2 whitespace-nowrap">
              Draft — Belum Sah
            </span>
          </div>
        )}
        <KwitansiHeader paymentNumber={payment.paymentNumber} date={date} qrDataUrl={qrDataUrl} />

        <div className="mt-4 rounded-xl border border-slate-200 divide-y divide-dashed divide-slate-200">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 w-32 flex-shrink-0">Sudah terima dari</span>
            <span className="text-sm font-black text-slate-900">{payment.client.name}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FileText className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 w-32 flex-shrink-0">Uang sejumlah</span>
            <span className="text-sm font-bold italic text-[#0544cc]">{terbilangRupiah(payment.totalAmount)}</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 w-32 flex-shrink-0">Untuk pembayaran</span>
            <span className="text-xs font-semibold text-slate-700">{isFullyPaid ? "Pelunasan" : "Pembayaran"} invoice {untukPembayaran}</span>
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
            <span className="text-xl font-black text-white">{formatRupiah(payment.totalAmount)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 print-exact-color">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Landmark className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <div className="leading-tight">
              <p className="text-[9px] font-bold text-[#0544cc] uppercase tracking-wide">Metode Pembayaran</p>
              <p className="text-xs font-black text-slate-900">{payment.account.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-3.5 h-3.5 text-[#0544cc]" />
            </div>
            <div className="leading-tight">
              <p className="text-[9px] font-bold text-[#0544cc] uppercase tracking-wide">Penerima</p>
              <p className="text-xs font-black text-slate-900">{receiverName}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200/60">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0544cc] flex-shrink-0" />
          <p className="text-xs text-slate-500 font-medium">Terima kasih atas kepercayaan dan kerja samanya.</p>
        </div>
      </Card>
    </div>
  );
};
