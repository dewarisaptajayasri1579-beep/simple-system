import Image from "next/image";
import { Hash, Calendar } from "lucide-react";

/** Header kwitansi cetak — logo 7Smarts + judul KWITANSI + badge No/Tanggal, meniru persis
 *  referensi "Kwitansi Keren" (lihat nota/Kwitansi Keren.png). Dipakai di halaman cetak Pembayaran.
 *  QR code (opsional) link ke /verify/kwitansi/[no] ditaruh di samping kanan judul KWITANSI
 *  (tinggi disamakan dengan tinggi font judulnya) — supaya kwitansi yang dicetak/di-PDF bisa
 *  dicek keasliannya lewat data yang benar-benar ada di sistem, bukan cuma dipercaya visual.
 *  Kertas A5 pas-pasan buat 1 halaman, jadi header ini TETAP 1 baris — jangan tambah baris baru. */
export const KwitansiHeader: React.FC<{ paymentNumber: string; date: string; qrDataUrl?: string }> = ({ paymentNumber, date, qrDataUrl }) => (
  <div className="print-exact-color">
    <div className="flex items-start justify-between flex-wrap gap-4">
      <Image src="/nota/logo-7smarts.png" alt="7Smarts" width={160} height={53} className="h-9 w-auto" priority />

      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <p className="text-3xl font-black text-slate-900 tracking-tight">KWITANSI</p>
          {qrDataUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qrDataUrl} alt="QR verifikasi" className="w-9 h-9 rounded-lg border-2 border-[#0544cc] flex-shrink-0" />
          )}
        </div>

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
  </div>
);
