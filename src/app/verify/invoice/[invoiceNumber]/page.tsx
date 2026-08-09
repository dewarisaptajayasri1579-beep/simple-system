import { ShieldCheck, ShieldAlert } from "lucide-react"
import { prisma } from "@/lib/prisma"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

const STATUS_LABEL: Record<string, string> = {
  unpaid: "Belum Dibayar",
  partial: "Dibayar Sebagian",
  paid: "Lunas",
  claimed_paid: "Klaim Sudah Bayar (belum diverifikasi)",
}

/** Halaman publik (tanpa login) untuk memverifikasi keaslian Invoice yang dicetak — di-scan
 *  lewat QR code di NotaPrintable. Sengaja tidak pakai AppLayout (bukan bagian aplikasi
 *  internal) dan cuma menampilkan ringkasan, bukan detail baris invoice. */
export default async function VerifyInvoicePage({ params }: { params: Promise<{ invoiceNumber: string }> }) {
  const { invoiceNumber } = await params
  const invoice = await prisma.invoice.findUnique({
    where: { invoiceNumber: decodeURIComponent(invoiceNumber) },
    include: { client: true },
  })

  if (!invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-rose-200 shadow-sm p-6 text-center">
          <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
          <h1 className="text-lg font-black text-slate-900 mt-3">Invoice Tidak Ditemukan</h1>
          <p className="text-sm text-slate-600 mt-1">
            Nomor <span className="font-mono font-semibold">{invoiceNumber}</span> tidak terdaftar di sistem SEVEN OS — dokumen ini kemungkinan
            bukan asli atau sudah diubah.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-emerald-200 shadow-sm p-6">
        <div className="flex flex-col items-center text-center">
          <ShieldCheck className="w-10 h-10 text-emerald-600" />
          <h1 className="text-lg font-black text-slate-900 mt-3">Dokumen Asli dari Sistem SEVEN OS</h1>
          <p className="text-xs text-slate-500 mt-1">7Smarts — {invoice.postStatus === "posted" ? "Invoice resmi terposting" : "Invoice masih draft"}</p>
        </div>

        <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">No. Invoice</span>
            <span className="font-bold text-slate-900">{invoice.invoiceNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Client</span>
            <span className="font-bold text-slate-900">{invoice.client.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Tanggal Terbit</span>
            <span className="font-semibold text-slate-800">{formatDate(invoice.issuedAt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Total</span>
            <span className="font-bold text-slate-900">{formatRupiah(invoice.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Status</span>
            <span className="font-bold text-slate-900">{STATUS_LABEL[invoice.status] ?? invoice.status}</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-6">Kalau data di atas tidak cocok dengan dokumen fisik/PDF yang Anda pegang, hubungi 7Smarts sebelum melakukan pembayaran.</p>
      </div>
    </div>
  )
}
