import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardTitle, CardDescription } from "@/components/ui"
import { HistoriUangMasukTable, type UangMasukRow } from "@/components/keuangan/HistoriUangMasukTable"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { jakartaTodayDateIso, jakartaIsoWeekday, shiftJakartaDateIso, parseJakartaDateIso } from "@/lib/datetime"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}
function formatShort(dateIso: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(parseJakartaDateIso(dateIso))
}

const WEEK_OPTIONS = [12, 26, 52]

/** Senin (ISO) dari minggu yang memuat tanggal Jakarta `iso`. */
function mondayOf(iso: string) {
  return shiftJakartaDateIso(iso, -(jakartaIsoWeekday(iso) - 1))
}

export default async function HistoriUangMasukPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const user = await requirePageRole(["owner", "direktur"])
  const params = await searchParams
  const weeks = WEEK_OPTIONS.includes(Number(params.weeks)) ? Number(params.weeks) : 12

  // Rentang: dari Senin (weeks-1) minggu lalu s/d sekarang — supaya tiap minggu di rekap utuh.
  const todayIso = jakartaTodayDateIso()
  const startIso = shiftJakartaDateIso(mondayOf(todayIso), -7 * (weeks - 1))
  const from = parseJakartaDateIso(startIso)

  // "Uang masuk dari penjualan" = InvoicePayment efektif (filter kanonik yang dipakai di seluruh
  // repo: paymentId null utk piutang migrasi, atau Payment-nya sudah posted), invoice tidak
  // dibatalkan. Bukan Kas Masuk manual (itu Transaction tanpa invoicePayment).
  const payments = await prisma.invoicePayment.findMany({
    where: {
      paidAt: { gte: from },
      invoice: { is: { postStatus: "posted" } },
      OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }],
    },
    orderBy: { paidAt: "desc" },
    take: 2000,
    select: {
      id: true,
      amount: true,
      paidAt: true,
      notes: true,
      account: { select: { name: true } },
      payment: { select: { id: true, paymentNumber: true } },
      invoice: { select: { id: true, invoiceNumber: true, client: { select: { name: true } } } },
    },
  })

  const rows: UangMasukRow[] = payments.map((p) => ({
    id: p.id,
    paidAt: p.paidAt.toISOString(),
    amount: p.amount,
    clientName: p.invoice.client.name,
    invoiceId: p.invoice.id,
    invoiceNumber: p.invoice.invoiceNumber,
    paymentId: p.payment?.id ?? null,
    paymentNumber: p.payment?.paymentNumber ?? null,
    accountName: p.account.name,
    notes: p.notes,
  }))

  // Rekap per minggu (Senin–Minggu, zona Jakarta), terbaru di atas.
  const byWeek = new Map<string, { count: number; total: number }>()
  for (const p of payments) {
    const key = mondayOf(jakartaTodayDateIso(p.paidAt))
    const bucket = byWeek.get(key) ?? { count: 0, total: 0 }
    bucket.count += 1
    bucket.total += p.amount
    byWeek.set(key, bucket)
  }
  const currentMonday = mondayOf(todayIso)
  const weekRecap = Array.from({ length: weeks }, (_, i) => {
    const monday = shiftJakartaDateIso(currentMonday, -7 * i)
    const sunday = shiftJakartaDateIso(monday, 6)
    const b = byWeek.get(monday) ?? { count: 0, total: 0 }
    return { monday, sunday, count: b.count, total: b.total, isCurrent: i === 0 }
  })
  const grandTotal = weekRecap.reduce((s, w) => s + w.total, 0)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <Link href="/keuangan" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
            <ChevronLeft className="w-3.5 h-3.5" />
            Keuangan
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">Histori Uang Masuk</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Uang masuk dari penjualan (pelunasan invoice), terbaru di atas. {weeks} minggu terakhir.
          </p>
          <div className="flex items-center gap-2 mt-3">
            {WEEK_OPTIONS.map((w) => (
              <Link
                key={w}
                href={`/keuangan/histori-uang-masuk?weeks=${w}`}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                  w === weeks
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {w} minggu
              </Link>
            ))}
          </div>
        </div>

        <Card variant="panel" padding="none">
          <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
            <div>
              <CardTitle>Rekap per Minggu</CardTitle>
              <CardDescription>Senin–Minggu (WIB)</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total {weeks} minggu</p>
              <p className="text-lg font-black text-emerald-700">{formatRupiah(grandTotal)}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/60 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 sm:px-6 py-2.5">Minggu</th>
                  <th className="px-5 sm:px-6 py-2.5 text-right">Pembayaran</th>
                  <th className="px-5 sm:px-6 py-2.5 text-right">Total Masuk</th>
                </tr>
              </thead>
              <tbody>
                {weekRecap.map((w) => (
                  <tr key={w.monday} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 sm:px-6 py-2.5 font-semibold text-slate-800">
                      {formatShort(w.monday)} – {formatShort(w.sunday)}
                      {w.isCurrent && <span className="ml-2 text-[10px] font-bold text-blue-600">MINGGU INI</span>}
                    </td>
                    <td className="px-5 sm:px-6 py-2.5 text-right tabular-nums text-slate-500">{w.count || "-"}</td>
                    <td className="px-5 sm:px-6 py-2.5 text-right font-bold tabular-nums text-slate-900">
                      {w.total ? formatRupiah(w.total) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <HistoriUangMasukTable rows={rows} />
      </div>
    </AppLayout>
  )
}
