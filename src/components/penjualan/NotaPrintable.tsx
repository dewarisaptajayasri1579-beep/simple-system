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
  qrDataUrl?: string;
  /** Total InvoicePayment efektif (posted) — kalau > 0, nota ikut nampilin baris "Dibayar (DP)"
   *  & "Sisa Kurang Bayar" di bawah Grand Total (mis. client bayar termin/DP dulu). */
  paid?: number;
}> = ({ invoice, bank, qrDataUrl, paid = 0 }) => {
  const remaining = Math.max(0, invoice.totalAmount - paid);
  return (
    <div className="print-only">
      <Card variant="panel" padding="sm" className="relative overflow-hidden print:shadow-none print:border-none print:bg-white print-nota-a5">
        {invoice.postStatus === "draft" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 print-exact-color">
            <span className="text-2xl font-black text-rose-600/40 uppercase tracking-widest -rotate-[25deg] border-4 border-rose-600/40 rounded-2xl px-6 py-2 whitespace-nowrap">
              Draft — Belum Sah
            </span>
          </div>
        )}
        <NotaHeader invoiceNumber={invoice.invoiceNumber} date={formatDate(invoice.issuedAt)} qrDataUrl={qrDataUrl} />

        <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
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

          <div className="rounded-xl border border-slate-200 bg-blue-50/50 p-3 print-exact-color">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-full bg-[#0544cc] flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              {/* Alamat & telepon ditaruh 1 kolom sama Nama (bukan sejajar avatar) — geser ke
                 kanan biar mulai dari posisi tulisan "Customer", persis referensi Nota Keren. */}
              <div className="leading-tight space-y-1 min-w-0">
                <p className="text-[8px] font-bold text-[#0544cc] uppercase tracking-wide">Customer</p>
                <p className="text-sm font-black text-slate-900">{invoice.client.name}</p>
                {(invoice.client.address || invoice.client.city) && (
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#0544cc]" />
                    <span className="leading-snug text-slate-700 font-medium text-[10px]">{invoice.client.address || invoice.client.city}</span>
                  </div>
                )}
                {invoice.client.phoneNumber && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 flex-shrink-0 text-[#0544cc]" />
                    <span className="text-slate-700 font-medium text-[10px]">{invoice.client.phoneNumber}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 print-exact-color">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="text-center px-2.5 py-2 rounded-tl-lg w-8">No</th>
                <th className="text-left px-2.5 py-2">Nama</th>
                <th className="text-center px-2.5 py-2">Qty</th>
                <th className="text-center px-2.5 py-2">Harga</th>
                <th className="text-center px-2.5 py-2 rounded-tr-lg">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="px-2.5 py-2 text-center text-slate-500">{i + 1}</td>
                  <td className="px-2.5 py-2 font-semibold text-slate-800">{line.description}</td>
                  <td className="px-2.5 py-2 text-center">{line.qty}</td>
                  <td className="px-2.5 py-2 text-center">{formatRupiah(line.unitPrice)}</td>
                  <td className="px-2.5 py-2 text-center font-bold">{formatRupiah(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 1 baris, 3 kolom — persis referensi "Nota Keren": Payment To + Terbilang (6/12,
           1 kartu nyambung dipisah garis vertikal tipis di tengah, bukan 2 kartu terpisah),
           Subtotal+Grand Total (6/12, lebih lebar karena isinya 2 baris). */}
        <div className="grid grid-cols-12 gap-3 mt-3 print-exact-color items-stretch">
          <div className="col-span-6 rounded-xl border border-slate-200 flex items-center divide-x divide-slate-200">
            {bank.name && (
              <div className="flex-1 flex items-center gap-2.5 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Landmark className="w-4 h-4 text-[#0544cc]" />
                </div>
                <div className="text-[10px]">
                  <p className="font-bold text-[#0544cc] uppercase tracking-wide">Payment To</p>
                  <p className="font-black text-slate-900 mt-0.5 text-xs">{bank.name}</p>
                  {bank.account && <p className="font-semibold text-slate-700 text-[10px]">{bank.account}</p>}
                  {bank.number && <p className="font-semibold text-slate-700 text-[10px]">{bank.number}</p>}
                </div>
              </div>
            )}
            <div className="flex-1 flex items-center gap-2.5 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-[#0544cc]" />
              </div>
              <div className="text-[10px]">
                <p className="font-bold text-[#0544cc] uppercase tracking-wide">Terbilang</p>
                <p className="font-semibold text-slate-700 mt-0.5 text-[10px] leading-snug">{terbilangRupiah(invoice.totalAmount)}</p>
              </div>
            </div>
          </div>

          <div className="col-span-6 flex flex-col gap-1.5">
            <div className="rounded-lg bg-slate-50 px-3 py-1.5 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
              <span>Subtotal</span>
              <span>{formatRupiah(invoice.subtotal)}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-1.5 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
                <span>Potongan</span>
                <span>- {formatRupiah(invoice.discountAmount)}</span>
              </div>
            )}
            {invoice.ppnEnabled && (
              <>
                <div className="rounded-lg bg-slate-50 px-3 py-1.5 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
                  <span>DPP</span>
                  <span>{formatRupiah(invoice.totalAmount - invoice.ppnAmount)}</span>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-1.5 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
                  <span>PPN {invoice.ppnRate}%{invoice.client.isPemungutPpn ? " (dipungut & disetor sendiri oleh Pemungut PPN)" : ""}</span>
                  <span>{formatRupiah(invoice.ppnAmount)}</span>
                </div>
              </>
            )}
            {/* Tinggi ngikutin sisa tinggi kolom (flex-1) supaya batas bawahnya rata sama kartu
               Payment To/Terbilang di sebelah kiri — teks di-tengah-in vertikal (items-center). */}
            <div className="rounded-lg bg-[#0544cc] px-4 flex-1 flex items-center justify-between text-white">
              <span className="text-xs font-bold uppercase tracking-wide">Grand Total</span>
              <span className="text-xl font-black">{formatRupiah(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>

        {paid > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-3 print-exact-color">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 flex justify-between text-xs font-bold text-emerald-700">
              <span>Dibayar (DP)</span>
              <span>{formatRupiah(paid)}</span>
            </div>
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 flex justify-between text-xs font-bold text-rose-700">
              <span>Sisa Kurang Bayar</span>
              <span>{formatRupiah(remaining)}</span>
            </div>
          </div>
        )}

        {invoice.notes && (
          <p className="mt-3 text-xs text-slate-600 border-t border-slate-200/60 pt-2">
            <span className="font-bold">Catatan: </span>
            {invoice.notes}
          </p>
        )}

        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200/60">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0544cc] flex-shrink-0" />
          <p className="text-xs text-slate-500 font-medium">Terima kasih atas kepercayaan dan kerja samanya.</p>
        </div>
      </Card>
    </div>
  );
};
