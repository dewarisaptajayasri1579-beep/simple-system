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

function formatDate(date: Date | null, isForeign: boolean) {
  if (!date) return "-";
  return isForeign
    ? new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
    : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date);
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

/** Format duit sesuai currency invoice — IDR pakai formatRupiah seperti sebelumnya, currency
 *  lain (JPY) pakai Intl.NumberFormat currency-nya sendiri (JPY otomatis 0 desimal). Nota-nota
 *  lama (currency null/"IDR") tetap identik tampilannya — lihat NotaPrintable di plan. */
function formatMoney(amount: number, currency: string) {
  if (currency === "IDR") return formatRupiah(amount);
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export interface BankInfo {
  name: string | null;
  account: string | null;
  number: string | null;
}

/** Rekening wire internasional (SWIFT) — dicetak sebagai ganti blok "Payment To" ringkas +
 *  Terbilang saat invoice.currency bukan IDR (lihat Settings.paymentBank*Intl). */
export interface BankIntlInfo {
  bankName: string | null;
  branchName: string | null;
  swiftCode: string | null;
  accountName: string | null;
  accountNumber: string | null;
}

/** Format cetak Nota — hanya render saat print (lihat .print-only di globals.css), meniru
 *  persis referensi "Nota Keren" (nota/Nota Keren.png). Ukuran kertas A5 (lihat @page di
 *  globals.css). Tampilan layar sehari-hari staf tetap yang lama, tidak disentuh — ini cuma
 *  dipakai saat window.print() dipanggil. */
export const NotaPrintable: React.FC<{
  invoice: Invoice & { client: Client; lines: InvoiceLine[] };
  bank: BankInfo;
  /** Cuma dipakai (dan wajib diisi caller) kalau invoice.currency bukan "IDR" — lihat blok
   *  "Payment To" versi SWIFT di bawah. */
  bankIntl?: BankIntlInfo;
  qrDataUrl?: string;
  /** Total InvoicePayment efektif (posted) — uang yang BENERAN sudah masuk kas. Kalau > 0, nota
   *  nampilin "Dibayar (DP)" & "Sisa Kurang Bayar" beneran, dan dpAmount (rencana) diabaikan. */
  paid?: number;
  /** DP yang DISEPAKATI tapi belum tentu sudah dibayar (Invoice.dpAmount, catatan saja) — cuma
   *  ditampilkan kalau `paid` masih 0, sebagai estimasi "Sisa Setelah DP (Rencana)". Begitu ada
   *  pelunasan asli (paid > 0), field ini tidak lagi dipakai di tampilan. */
  dpAmount?: number;
}> = ({ invoice, bank, bankIntl, qrDataUrl, paid = 0, dpAmount = 0 }) => {
  // Nota client asing (currency bukan IDR, mis. JPY untuk client Jepang) — semua teks statis
  // Inggris, tanpa Terbilang/Diskon, pakai blok Payment To versi SWIFT. Lihat NotaPrintable di
  // plan untuk daftar lengkap perbedaannya.
  const isForeign = invoice.currency !== "IDR";
  const money = (n: number) => formatMoney(n, invoice.currency);
  const remaining = Math.max(0, invoice.totalAmount - paid);
  const remainingAfterPlannedDp = Math.max(0, invoice.totalAmount - dpAmount);
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
        <NotaHeader invoiceNumber={invoice.invoiceNumber} date={formatDate(invoice.issuedAt, isForeign)} qrDataUrl={qrDataUrl} />

        <div className="grid grid-cols-2 gap-3 mt-1.5 text-xs">
          <div className="rounded-xl border border-slate-200 p-2 space-y-1.5">
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

          <div className="rounded-xl border border-slate-200 bg-blue-50/50 p-2 print-exact-color">
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

        <div className="mt-1.5 print-exact-color">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="text-center px-2.5 py-1 rounded-tl-lg w-8">No</th>
                <th className="text-left px-2.5 py-1">{isForeign ? "Item" : "Nama"}</th>
                <th className="text-center px-2.5 py-1">Qty</th>
                <th className="text-center px-2.5 py-1">{isForeign ? "Price" : "Harga"}</th>
                <th className="text-center px-2.5 py-1 rounded-tr-lg">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="px-2.5 py-1 text-center text-slate-500">{i + 1}</td>
                  <td className="px-2.5 py-1 font-semibold text-slate-800">{line.description}</td>
                  <td className="px-2.5 py-1 text-center">{line.qty}</td>
                  <td className="px-2.5 py-1 text-center">{money(line.unitPrice)}</td>
                  <td className="px-2.5 py-1 text-center font-bold">{money(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 1 baris, 3 kolom — persis referensi "Nota Keren": Payment To + Terbilang (6/12,
           1 kartu nyambung dipisah garis vertikal tipis di tengah, bukan 2 kartu terpisah),
           Subtotal+Grand Total (6/12, lebih lebar karena isinya 2 baris). */}
        <div className="grid grid-cols-12 gap-3 mt-1.5 print-exact-color items-stretch">
          <div className="col-span-6 rounded-xl border border-slate-200 flex items-center divide-x divide-slate-200">
            {isForeign ? (
              // Blok SWIFT — ganti Payment To ringkas + Terbilang (tidak ada terjemahan
              // angka-jadi-kata untuk JPY), 5 baris sesuai format wire internasional.
              <div className="flex-1 px-4 py-2.5">
                <p className="font-bold text-[#0544cc] uppercase tracking-wide text-[10px] mb-1">Payment To</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-700">
                  <span className="text-slate-500">Bank Name</span>
                  <span className="font-black text-slate-900">{bankIntl?.bankName || "-"}</span>
                  <span className="text-slate-500">Branch Name</span>
                  <span>{bankIntl?.branchName || "-"}</span>
                  <span className="text-slate-500">SWIFT Code</span>
                  <span>{bankIntl?.swiftCode || "-"}</span>
                  <span className="text-slate-500">Account Name</span>
                  <span>{bankIntl?.accountName || "-"}</span>
                  <span className="text-slate-500">Account Number</span>
                  <span>{bankIntl?.accountNumber || "-"}</span>
                </div>
              </div>
            ) : (
              <>
                {bank.name && (
                  <div className="flex-1 flex items-center gap-2.5 px-4 py-2.5">
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
                <div className="flex-1 flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-[#0544cc]" />
                  </div>
                  <div className="text-[10px]">
                    <p className="font-bold text-[#0544cc] uppercase tracking-wide">Terbilang</p>
                    <p className="font-semibold text-slate-700 mt-0.5 text-[10px] leading-snug">{terbilangRupiah(invoice.totalAmount)}</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="col-span-6 flex flex-col gap-1">
            <div className="rounded-lg bg-slate-50 px-3 py-1 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
              <span>Subtotal</span>
              <span>{money(invoice.subtotal)}</span>
            </div>
            {invoice.discountAmount > 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-1 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
                <span>{isForeign ? "Discount" : "Potongan"}</span>
                <span>- {money(invoice.discountAmount)}</span>
              </div>
            )}
            {invoice.ppnEnabled && (
              <>
                <div className="rounded-lg bg-slate-50 px-3 py-1 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
                  <span>DPP</span>
                  <span>{money(invoice.totalAmount - invoice.ppnAmount)}</span>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-1 flex justify-between text-[10px] font-semibold text-slate-700 flex-shrink-0">
                  <span>PPN {invoice.ppnRate}%{invoice.client.isPemungutPpn ? " (dipungut & disetor sendiri oleh Pemungut PPN)" : ""}</span>
                  <span>{money(invoice.ppnAmount)}</span>
                </div>
              </>
            )}
            {/* Tinggi ngikutin sisa tinggi kolom (flex-1) supaya batas bawahnya rata sama kartu
               Payment To/Terbilang di sebelah kiri — teks di-tengah-in vertikal (items-center). */}
            <div className="rounded-lg bg-[#0544cc] px-4 flex-1 flex items-center justify-between text-white">
              <span className="text-xs font-bold uppercase tracking-wide">Grand Total</span>
              <span className="text-xl font-black">{money(invoice.totalAmount)}</span>
            </div>
          </div>
        </div>

        {paid > 0 ? (
          <div className="grid grid-cols-2 gap-3 mt-1.5 print-exact-color">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 flex justify-between text-xs font-bold text-emerald-700">
              <span>{isForeign ? "Paid (DP)" : "Dibayar (DP)"}</span>
              <span>{money(paid)}</span>
            </div>
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-1 flex justify-between text-xs font-bold text-rose-700">
              <span>{isForeign ? "Balance Due" : "Sisa Kurang Bayar"}</span>
              <span>{money(remaining)}</span>
            </div>
          </div>
        ) : (
          dpAmount > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-1.5 print-exact-color">
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1 flex justify-between text-xs font-bold text-amber-700">
                <span>Down Payment</span>
                <span>{money(dpAmount)}</span>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1 flex justify-between text-xs font-bold text-slate-700">
                <span>{isForeign ? "Balance After DP" : "Sisa Setelah DP"}</span>
                <span>{money(remainingAfterPlannedDp)}</span>
              </div>
            </div>
          )
        )}

        {invoice.notes && (
          <p className="mt-1.5 text-xs text-slate-600 border-t border-slate-200/60 pt-1.5">
            <span className="font-bold">{isForeign ? "Notes: " : "Catatan: "}</span>
            {invoice.notes}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-200/60">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0544cc] flex-shrink-0" />
          <p className="text-xs text-slate-500 font-medium">
            {isForeign ? "Thank you for your trust and cooperation." : "Terima kasih atas kepercayaan dan kerja samanya."}
          </p>
        </div>
      </Card>
    </div>
  );
};
