import { Card } from "@/components/ui";
import { NotaHeader } from "./NotaHeader";
import { terbilangRupiah } from "@/lib/terbilang";
import { MapPin, Phone, Mail, User, Landmark, FileText, ShieldCheck } from "lucide-react";
import type { Invoice, InvoiceLine, Client } from "@prisma/client";

const COMPANY = {
  addressLine1: "Kp. Bhayangkara RT 04/15,",
  addressLine2: "Siswodipuran, Boyolali, Jawa Tengah",
  phone: "087739255404",
  email: "7smarts.id@gmail.com",
};

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export interface BankInfo {
  name: string | null;
  account: string | null;
  number: string | null;
}

/** Format cetak Nota — hanya render saat print (lihat .print-only di globals.css), meniru
 *  persis referensi "Nota Keren" (nota/Nota Keren.png). Ukuran kertas A5 (lihat @page di
 *  globals.css). Tampilan layar sehari-hari staf tetap yang lama, tidak disentuh — ini cuma
 *  dipakai saat window.print() dipanggil. */
export const NotaPrintable: React.FC<{
  invoice: Invoice & { client: Client; lines: InvoiceLine[] };
  bank: BankInfo;
}> = ({ invoice, bank }) => {
  return (
    <div className="print-only">
      <Card variant="panel" padding="md" className="print:shadow-none print:border-none print:bg-white print-nota-a5">
        <NotaHeader invoiceNumber={invoice.invoiceNumber} date={formatDate(invoice.issuedAt)} />

        <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#0544cc]" />
              <div className="leading-snug text-slate-700 font-medium">
                <div>{COMPANY.addressLine1}</div>
                <div>{COMPANY.addressLine2}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 flex-shrink-0 text-[#0544cc]" />
              <span className="text-slate-700 font-medium">{COMPANY.phone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-[#0544cc]" />
              <span className="text-slate-700 font-medium">{COMPANY.email}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-blue-50/50 p-3 space-y-2 print-exact-color">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#0544cc] flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="leading-tight">
                <p className="text-[9px] font-bold text-[#0544cc] uppercase tracking-wide">Customer</p>
                <p className="text-xs font-black text-slate-900">{invoice.client.name}</p>
              </div>
            </div>
            {(invoice.client.address || invoice.client.city) && (
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[#0544cc]" />
                <span className="leading-snug text-slate-700 font-medium">{invoice.client.address || invoice.client.city}</span>
              </div>
            )}
            {invoice.client.phoneNumber && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 flex-shrink-0 text-[#0544cc]" />
                <span className="text-slate-700 font-medium">{invoice.client.phoneNumber}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 print-exact-color">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="text-left px-2.5 py-2 rounded-tl-lg w-8">No</th>
                <th className="text-left px-2.5 py-2">Nama</th>
                <th className="text-right px-2.5 py-2">Qty</th>
                <th className="text-right px-2.5 py-2">Harga</th>
                <th className="text-right px-2.5 py-2 rounded-tr-lg">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="px-2.5 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-2.5 py-2 font-semibold text-slate-800">{line.description}</td>
                  <td className="px-2.5 py-2 text-right">{line.qty}</td>
                  <td className="px-2.5 py-2 text-right">{formatRupiah(line.unitPrice)}</td>
                  <td className="px-2.5 py-2 text-right font-bold">{formatRupiah(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Kolom kiri (Payment To + Terbilang ditumpuk, bukan sebelahan) supaya tetap kebaca di
           kertas A5 yang sempit — versi sebelahan bikin teks "BCA"/nominal terbilang kepotong
           per-kata karena kolomnya kesempitan. */}
        <div className="flex flex-col sm:flex-row justify-between gap-3 mt-4">
          <div className="flex-1 space-y-2">
            {bank.name && (
              <div className="rounded-xl border border-slate-200 px-3 py-2 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <Landmark className="w-3 h-3 text-[#0544cc] flex-shrink-0" />
                  <p className="font-bold text-[#0544cc] uppercase tracking-wide">Payment To</p>
                </div>
                <p className="font-black text-slate-900 mt-1 text-xs">
                  {bank.name}
                  {bank.account && <span className="font-semibold text-slate-700"> — {bank.account}</span>}
                  {bank.number && <span className="font-semibold text-slate-700"> · {bank.number}</span>}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 px-3 py-2 text-[10px]">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-[#0544cc] flex-shrink-0" />
                <p className="font-bold text-[#0544cc] uppercase tracking-wide">Terbilang</p>
              </div>
              <p className="font-semibold text-slate-700 mt-1 text-xs leading-snug">{terbilangRupiah(invoice.totalAmount)}</p>
            </div>
          </div>

          <div className="w-full sm:w-40 flex-shrink-0 space-y-1.5">
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 flex justify-between text-[10px] font-semibold text-slate-700">
              <span>Subtotal</span>
              <span>{formatRupiah(invoice.subtotal)}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 flex justify-between text-[10px] font-semibold text-slate-700">
                <span>Potongan</span>
                <span>- {formatRupiah(invoice.discountAmount)}</span>
              </div>
            )}
            {invoice.ppnEnabled && (
              <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 flex justify-between text-[10px] font-semibold text-slate-700">
                <span>PPN {invoice.ppnRate}%</span>
                <span>{formatRupiah(invoice.ppnAmount)}</span>
              </div>
            )}
            <div className="rounded-lg bg-[#0544cc] px-2.5 py-2 text-white">
              <p className="text-[9px] font-bold uppercase tracking-wide">Grand Total</p>
              <p className="text-xs font-black">{formatRupiah(invoice.totalAmount)}</p>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <p className="mt-4 text-xs text-slate-600 border-t border-slate-200/60 pt-3">
            <span className="font-bold">Catatan: </span>
            {invoice.notes}
          </p>
        )}

        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200/60">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0544cc] flex-shrink-0" />
          <p className="text-xs text-slate-500 font-medium">Terima kasih atas kepercayaan dan kerja samanya.</p>
        </div>
      </Card>
    </div>
  );
};
