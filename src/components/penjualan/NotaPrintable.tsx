import { Card } from "@/components/ui";
import { NotaHeader } from "./NotaHeader";
import { terbilangRupiah } from "@/lib/terbilang";
import type { Invoice, InvoiceLine, Client } from "@prisma/client";

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
 *  persis referensi lama (nota/Format Nota.png). Tampilan layar sehari-hari staf tetap yang
 *  lama, tidak disentuh — ini cuma dipakai saat window.print() dipanggil. */
export const NotaPrintable: React.FC<{
  invoice: Invoice & { client: Client; lines: InvoiceLine[] };
  bank: BankInfo;
}> = ({ invoice, bank }) => {
  return (
    <div className="print-only">
      <Card variant="panel" padding="lg" className="print:shadow-none print:border-none print:bg-white">
        <NotaHeader />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60 text-sm font-mono">
          <div className="space-y-1">
            <div className="flex gap-2">
              <span className="w-24 flex-shrink-0 text-slate-500 font-semibold">Inv.Number</span>
              <span className="font-bold text-slate-900">: {invoice.invoiceNumber}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 flex-shrink-0 text-slate-500 font-semibold">Date</span>
              <span className="font-bold text-slate-900">: {formatDate(invoice.issuedAt)}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex gap-2">
              <span className="w-20 flex-shrink-0 text-slate-500 font-semibold">Customer</span>
              <span className="font-bold text-slate-900">: {invoice.client.name}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-20 flex-shrink-0 text-slate-500 font-semibold">Address</span>
              <span className="font-semibold text-slate-700">: {invoice.client.address || invoice.client.city || "-"}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-20 flex-shrink-0 text-slate-500 font-semibold">Phone</span>
              <span className="font-semibold text-slate-700">: {invoice.client.phoneNumber || "-"}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 print-exact-color">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0544cc] text-white">
                <th className="text-left px-3 py-2 rounded-tl-lg w-10">No</th>
                <th className="text-left px-3 py-2">Nama</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Harga</th>
                <th className="text-right px-3 py-2 rounded-tr-lg">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={line.id} className={i % 2 === 1 ? "bg-blue-50/60" : ""}>
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{line.description}</td>
                  <td className="px-3 py-2 text-right">{line.qty}</td>
                  <td className="px-3 py-2 text-right">{formatRupiah(line.unitPrice)}</td>
                  <td className="px-3 py-2 text-right font-bold">{formatRupiah(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end border-t-2 border-[#0544cc] py-2 px-3 font-bold text-slate-900">
            {formatRupiah(invoice.subtotal)}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between gap-6 mt-6">
          {bank.name && (
            <div className="text-sm">
              <p className="font-bold text-slate-800">Payment To :</p>
              <p className="font-black text-slate-900 mt-1">{bank.name}</p>
              {bank.account && <p className="font-semibold text-slate-700">{bank.account}</p>}
              {bank.number && <p className="font-semibold text-slate-700">{bank.number}</p>}
            </div>
          )}
          <div className="w-full sm:w-72 sm:ml-auto print-exact-color">
            <table className="w-full text-sm border-2 border-[#0544cc] rounded-lg overflow-hidden border-collapse">
              <tbody>
                {invoice.discountAmount > 0 && (
                  <tr className="border-b border-[#0544cc]/30">
                    <td className="px-3 py-2 bg-blue-50/60 font-semibold">Potongan</td>
                    <td className="px-3 py-2 bg-blue-50/60 text-right font-semibold">{formatRupiah(invoice.discountAmount)}</td>
                  </tr>
                )}
                {invoice.ppnEnabled && (
                  <tr className="border-b border-[#0544cc]/30">
                    <td className="px-3 py-2 font-semibold">PPN {invoice.ppnRate}%</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatRupiah(invoice.ppnAmount)}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-3 py-2.5 bg-[#0544cc] text-white font-black">Grand Total</td>
                  <td className="px-3 py-2.5 bg-[#0544cc] text-white text-right font-black">{formatRupiah(invoice.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 bg-slate-50 rounded-lg px-4 py-3 text-right text-sm font-bold text-slate-700 print-exact-color">
          {terbilangRupiah(invoice.totalAmount)}
        </div>

        {invoice.notes && (
          <p className="mt-6 text-sm text-slate-600 border-t border-slate-200/60 pt-4">
            <span className="font-bold">Catatan: </span>
            {invoice.notes}
          </p>
        )}
      </Card>
    </div>
  );
};
