import { Card } from "@/components/ui"
import { NotaHeader } from "@/components/penjualan/NotaHeader"

export interface LampiranPrinciple {
  name: string
  appUrl: string | null
}

/**
 * Lampiran "Daftar Principle" — halaman KEDUA dari Invoice Over Principle (lihat ayu.md:
 * "nanti sdh otomatis hitung Nominalnya, di halaman selanjutnya ada lampiran Daftar
 * Principlenya"). Sama seperti NotaPrintable: cuma muncul saat print (.print-only), tidak
 * pernah dilihat staf di layar.
 *
 * Isinya dari SNAPSHOT (PrincipleInvoiceItem), bukan daftar principle hari ini — lampiran yang
 * sudah dikirim ke client tidak boleh berubah kalau daftarnya diubah bulan berikutnya.
 */
export const PrincipleLampiranPrintable: React.FC<{
  invoiceNumber: string
  /** Tanggal invoice yang sudah diformat — dipakai di NotaHeader supaya identik dgn halaman 1. */
  dateLabel: string
  clientName: string
  companyName: string
  periodLabel: string
  principles: LampiranPrinciple[]
}> = ({ invoiceNumber, dateLabel, clientName, companyName, periodLabel, principles }) => (
  <div className="print-only print-page-break">
    <Card variant="panel" padding="sm" className="print-nota-a5">
      <NotaHeader invoiceNumber={invoiceNumber} date={dateLabel} />

      <div className="mt-2 mb-2">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-900">Lampiran: Daftar Principle</p>
        <p className="text-[10px] text-slate-600">
          {companyName} · Periode {periodLabel} · {principles.length} principle
        </p>
        <p className="text-[10px] text-slate-600">
          Lampiran dari Invoice {invoiceNumber} — {clientName}
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-slate-300">
            <th className="text-left py-1 pr-2 w-8 font-bold">No</th>
            <th className="text-left py-1 pr-2 font-bold">Nama Principle</th>
            <th className="text-left py-1 font-bold">Link Aplikasi</th>
          </tr>
        </thead>
        <tbody>
          {principles.map((p, i) => (
            <tr key={`${p.name}-${i}`} className="border-b border-slate-200">
              <td className="py-1 pr-2 align-top text-slate-500">{i + 1}</td>
              <td className="py-1 pr-2 align-top font-semibold">{p.name}</td>
              <td className="py-1 align-top text-slate-600">{p.appUrl ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[9px] text-slate-500">
        Jumlah principle di lampiran ini yang menjadi dasar perhitungan nominal invoice.
      </p>
    </Card>
  </div>
)
