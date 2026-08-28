import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { HistoriUangMasukClient, type UangMasukRow, type WeekRecap } from "@/components/keuangan/HistoriUangMasukClient"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { jakartaTodayDateIso, jakartaIsoWeekday, shiftJakartaDateIso, parseJakartaDateIso } from "@/lib/datetime"

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
  const currentMonday = mondayOf(todayIso)
  const startIso = shiftJakartaDateIso(currentMonday, -7 * (weeks - 1))
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
    weekKey: mondayOf(jakartaTodayDateIso(p.paidAt)),
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
  for (const r of rows) {
    const b = byWeek.get(r.weekKey) ?? { count: 0, total: 0 }
    b.count += 1
    b.total += r.amount
    byWeek.set(r.weekKey, b)
  }
  const weekRecap: WeekRecap[] = Array.from({ length: weeks }, (_, i) => {
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
            Uang masuk dari penjualan (pelunasan invoice), direkap per minggu. Klik satu minggu untuk lihat rinciannya.
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

        <HistoriUangMasukClient weeks={weeks} weekRecap={weekRecap} rows={rows} grandTotal={grandTotal} />
      </div>
    </AppLayout>
  )
}
