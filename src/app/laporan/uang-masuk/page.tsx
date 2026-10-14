import { AppLayout } from "@/components/layout/AppLayout"
import { MonthFilter } from "@/components/laporan/MonthFilter"
import { UangMasukTable, type UangMasukRow } from "@/components/laporan/UangMasukTable"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { resolveReportMonth } from "@/lib/report-month"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

function formatTanggal(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })
}

export default async function LaporanUangMasukPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string }>
}) {
  const user = await requirePageRole(["owner", "direktur"])
  const month = resolveReportMonth(await searchParams)

  // Dasarnya kwitansi Pembayaran (bukan Transaction) — satu kwitansi bisa melunasi beberapa
  // invoice, jadi barisnya dipecah per invoice supaya kolom "No Invoice" punya satu nilai pasti.
  // Hanya `posted`: draft belum menggerakkan kas dan voided sudah dibatalkan, jadi dua-duanya
  // bukan uang masuk. Tanggal acuan = paidAt (tanggal uang diterima), bukan createdAt.
  const payments = await prisma.payment.findMany({
    where: { postStatus: "posted", paidAt: { gte: month.from, lte: month.to } },
    orderBy: { paidAt: "asc" },
    take: 2000, // batas aman — sama alasan dengan daftar Pembayaran
    select: {
      id: true,
      paymentNumber: true,
      paidAt: true,
      notes: true,
      totalAmount: true,
      client: { select: { name: true } },
      invoicePayments: {
        select: {
          id: true,
          amount: true,
          kursRate: true,
          notes: true,
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      },
    },
  })

  // Keterangan kwitansi sering dikosongkan — jadi dipakai isi invoice-nya sebagai cadangan
  // ("Maintenance Blesscafe", "Over Principle …") supaya kolom Keterangan tidak melompong.
  // Satu query untuk semua baris (bukan per baris) — lihat aturan N+1 di CLAUDE.md.
  const invoiceIds = payments.flatMap((p) => p.invoicePayments.map((ip) => ip.invoice.id))
  const lines = invoiceIds.length
    ? await prisma.invoiceLine.findMany({
        where: { invoiceId: { in: invoiceIds } },
        select: { invoiceId: true, description: true },
      })
    : []
  const lineDescByInvoice = new Map<string, string[]>()
  for (const l of lines) {
    const list = lineDescByInvoice.get(l.invoiceId) ?? []
    list.push(l.description)
    lineDescByInvoice.set(l.invoiceId, list)
  }
  /** Pilih teks pertama yang benar-benar berisi — catatan di DB banyak yang string KOSONG
   *  (bukan null), jadi `??` saja tidak cukup buat jatuh ke cadangan berikutnya. */
  const firstFilled = (...values: (string | null | undefined)[]) =>
    values.find((v) => v && v.trim().length > 0)?.trim() ?? null

  /** Ringkas beberapa baris invoice jadi satu keterangan: "A", atau "A (+2 item lain)". */
  const describeInvoice = (invoiceId: string) => {
    const list = lineDescByInvoice.get(invoiceId)
    if (!list || list.length === 0) return null
    return list.length === 1 ? list[0] : `${list[0]} (+${list.length - 1} item lain)`
  }

  const rows: UangMasukRow[] = []
  for (const p of payments) {
    const paidAtLabel = formatTanggal(p.paidAt)
    if (p.invoicePayments.length === 0) {
      // Kwitansi tanpa rincian invoice (data migrasi) — tetap ditampilkan supaya total laporan
      // sama dengan kas yang benar-benar masuk, nomor invoicenya saja yang kosong.
      rows.push({
        id: p.id,
        invoiceNumber: null,
        paymentNumber: p.paymentNumber,
        clientName: p.client.name,
        notes: firstFilled(p.notes),
        paidAtLabel,
        amount: p.totalAmount,
      })
      continue
    }
    for (const ip of p.invoicePayments) {
      rows.push({
        id: ip.id,
        invoiceNumber: ip.invoice.invoiceNumber,
        paymentNumber: p.paymentNumber,
        clientName: p.client.name,
        notes: firstFilled(ip.notes, p.notes, describeInvoice(ip.invoice.id)),
        paidAtLabel,
        // `amount` disimpan dalam currency invoice (mis. JPY); kas riil = amount × kurs. Invoice
        // IDR kursRate-nya null → dianggap 1. Pola sama dengan cashAmount di POST /api/payments.
        amount: Math.round(ip.amount * (ip.kursRate ?? 1)),
      })
    }
  }

  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Laporan Uang Masuk</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Dari kwitansi Pembayaran yang sudah di-posting · {month.label}
            </p>
          </div>
          <MonthFilter monthIso={month.monthIso} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card variant="feature" padding="md">
            <CardDescription>Total Uang Masuk</CardDescription>
            <p className="text-2xl font-black text-emerald-700 mt-1">{formatRupiah(total)}</p>
          </Card>
          <Card variant="feature" padding="md">
            <CardDescription>Jumlah Pembayaran</CardDescription>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {rows.length} baris <span className="text-sm font-bold text-slate-400">/ {payments.length} kwitansi</span>
            </p>
          </Card>
        </div>

        <Card variant="panel" padding="none">
          <CardHeader className="p-5 sm:p-6 mb-0">
            <CardTitle>Rincian {month.label}</CardTitle>
            <CardDescription>
              Satu baris per invoice yang dilunasi — tanggal uang diterima, client, keterangan, dan nominalnya.
              Kwitansi draft & yang dibatalkan (voided) tidak dihitung.
            </CardDescription>
          </CardHeader>
          <UangMasukTable rows={rows} />
        </Card>
      </div>
    </AppLayout>
  )
}
