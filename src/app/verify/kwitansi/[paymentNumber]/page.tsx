import { ShieldCheck, ShieldAlert } from "lucide-react"
import { prisma } from "@/lib/prisma"

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Halaman publik (tanpa login) untuk memverifikasi keaslian Kwitansi yang dicetak — di-scan
 *  lewat QR code di KwitansiPrintable. Sengaja tidak pakai AppLayout (bukan bagian aplikasi
 *  internal) dan cuma menampilkan ringkasan, bukan rincian invoice yang dibayar. */
export default async function VerifyKwitansiPage({ params }: { params: Promise<{ paymentNumber: string }> }) {
  const { paymentNumber } = await params
  const payment = await prisma.payment.findUnique({
    where: { paymentNumber: decodeURIComponent(paymentNumber) },
    include: { client: true, account: true },
  })

  if (!payment) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-rose-200 shadow-sm p-6 text-center">
          <ShieldAlert className="w-10 h-10 text-rose-600 mx-auto" />
          <h1 className="text-lg font-black text-slate-900 mt-3">Kwitansi Tidak Ditemukan</h1>
          <p className="text-sm text-slate-600 mt-1">
            Nomor <span className="font-mono font-semibold">{paymentNumber}</span> tidak terdaftar di sistem SEVEN OS — dokumen ini kemungkinan
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
          <p className="text-xs text-slate-500 mt-1">7Smarts — {payment.postStatus === "posted" ? "Kwitansi resmi terposting" : "Kwitansi masih draft"}</p>
        </div>

        <div className="mt-6 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">No. Kwitansi</span>
            <span className="font-bold text-slate-900">{payment.paymentNumber}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Diterima Dari</span>
            <span className="font-bold text-slate-900">{payment.client.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Tanggal</span>
            <span className="font-semibold text-slate-800">{formatDate(payment.paidAt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Jumlah</span>
            <span className="font-bold text-slate-900">{formatRupiah(payment.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500 font-medium">Masuk ke Akun</span>
            <span className="font-semibold text-slate-800">{payment.account.name}</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-6">Kalau data di atas tidak cocok dengan dokumen fisik/PDF yang Anda pegang, hubungi 7Smarts.</p>
      </div>
    </div>
  )
}
