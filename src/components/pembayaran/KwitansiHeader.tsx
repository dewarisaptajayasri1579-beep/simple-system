import Image from "next/image";
import { Hash, Calendar } from "lucide-react";

/** Header kwitansi cetak — logo 7Smarts + judul KWITANSI + badge No/Tanggal, meniru persis
 *  referensi "Kwitansi Keren" (lihat nota/Kwitansi Keren.png). Dipakai di halaman cetak Pembayaran. */
export const KwitansiHeader: React.FC<{ paymentNumber: string; date: string }> = ({ paymentNumber, date }) => (
  <div className="print-exact-color">
    <div className="flex items-start justify-between flex-wrap gap-4">
      <Image src="/nota/logo-7smarts.png" alt="7Smarts" width={160} height={53} className="h-9 w-auto" priority />
      <p className="text-3xl font-black text-slate-900 tracking-tight">KWITANSI</p>
    </div>

    <div className="flex justify-end mt-2">
      <div className="flex items-stretch">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-md border border-[#0544cc] flex items-center justify-center flex-shrink-0">
            <Hash className="w-3.5 h-3.5 text-[#0544cc]" />
          </div>
          <div className="leading-tight">
            <p className="text-[10px] text-slate-500 font-semibold">No.</p>
            <p className="text-xs font-black text-slate-900">{paymentNumber}</p>
          </div>
        </div>
        <div className="w-px bg-slate-200" />
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-7 h-7 rounded-md border border-[#0544cc] flex items-center justify-center flex-shrink-0">
            <Calendar className="w-3.5 h-3.5 text-[#0544cc]" />
          </div>
          <div className="leading-tight">
            <p className="text-[10px] text-slate-500 font-semibold">Tanggal</p>
            <p className="text-xs font-black text-slate-900">{date}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);
