import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { BuatInvoicePekerjaanButton } from "@/components/blesscom/BuatInvoicePekerjaanButton"
import { PekerjaanBlesscomForm } from "@/components/blesscom/PekerjaanBlesscomForm"
import { Alert, Card, CardHeader, CardTitle } from "@/components/ui"
import { getBlesscomLevelOptions } from "@/lib/blesscom-level-catalog"
import { getPrincipleOptions } from "@/lib/blesscom-principle-options"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

/** "YYYY-MM-DD" di zona WIB — supaya <input type="date"> nampilin tanggal yang sama dengan daftar. */
function dateInputValue(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d)
}

export default async function PekerjaanBlesscomEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const order = await prisma.blesscomWorkOrder.findUnique({
    where: { id },
    select: {
      id: true,
      workDate: true,
      notes: true,
      invoiceId: true,
      invoice: { select: { id: true, invoiceNumber: true } },
      principle: {
        select: { id: true, name: true, company: { select: { name: true, clientId: true } } },
      },
      items: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, categoryName: true, levelName: true, amount: true, refAmount: true, workPriceItemId: true },
      },
    },
  })
  if (!order) notFound()

  const total = order.items.reduce((s, it) => s + it.amount, 0)
  const sudahDitagih = Boolean(order.invoiceId)

  // Transaksi lain principle yang sama yang belum ditagih — ditawarkan buat digabung ke satu
  // invoice (1 invoice = 1 principle). Cuma diambil kalau transaksi ini sendiri belum ditagih.
  const others = sudahDitagih
    ? []
    : await prisma.blesscomWorkOrder.findMany({
        where: { principleId: order.principle.id, invoiceId: null, id: { not: order.id } },
        orderBy: { workDate: "asc" },
        take: 50,
        select: {
          id: true,
          workDate: true,
          items: { orderBy: { sortOrder: "asc" }, select: { name: true, categoryName: true, levelName: true, amount: true } },
        },
      })

  const [principleOptions, levelOptions] = sudahDitagih
    ? [[], []]
    : await Promise.all([getPrincipleOptions(), getBlesscomLevelOptions()])

  // Principle yang sudah non-aktif tidak ada di daftar opsi — tetap disertakan supaya transaksi
  // lamanya masih bisa dibuka & disimpan tanpa principle-nya ikut berubah.
  const options = principleOptions.some((o) => o.value === order.principle.id)
    ? principleOptions
    : [...principleOptions, { value: order.principle.id, label: `${order.principle.name} · ${order.principle.company.name}` }]

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <Link
              href="/blesscom/pekerjaan"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Daftar Pekerjaan
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
              {sudahDitagih ? "Transaksi Pekerjaan" : "Edit Transaksi"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              {order.principle.name} · {order.principle.company.name}
            </p>
          </div>
          {!sudahDitagih && (
            <BuatInvoicePekerjaanButton
              current={{
                id: order.id,
                workDate: order.workDate.toISOString(),
                items: order.items.map((it) => ({
                  name: it.name,
                  categoryName: it.categoryName,
                  levelName: it.levelName,
                  amount: it.amount,
                })),
              }}
              others={others.map((o) => ({ ...o, workDate: o.workDate.toISOString() }))}
              principleName={order.principle.name}
              companyName={order.principle.company.name}
              clientId={order.principle.company.clientId}
            />
          )}
        </div>

        {sudahDitagih ? (
          <>
            <Alert variant="info">
              Transaksi ini sudah ditagihkan di invoice{" "}
              <Link href={`/penjualan/${order.invoice?.id}`} className="font-bold underline">
                {order.invoice?.invoiceNumber}
              </Link>
              , jadi isinya dikunci — nominal yang sudah dikirim ke client tidak boleh berubah. Hapus invoice-nya dulu
              kalau memang salah input.
            </Alert>

            <Card variant="panel" padding="lg">
              <CardHeader>
                <CardTitle>Data Transaksi</CardTitle>
              </CardHeader>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs font-bold text-slate-500 uppercase tracking-wide">Tanggal</dt>
                  <dd className="font-semibold text-slate-800 mt-0.5">
                    {new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(order.workDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold text-slate-500 uppercase tracking-wide">Principle</dt>
                  <dd className="font-semibold text-slate-800 mt-0.5">
                    {order.principle.name} · {order.principle.company.name}
                  </dd>
                </div>
                {order.notes && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-bold text-slate-500 uppercase tracking-wide">Catatan</dt>
                    <dd className="text-slate-700 mt-0.5 whitespace-pre-line">{order.notes}</dd>
                  </div>
                )}
              </dl>
            </Card>

            <Card variant="panel" padding="none">
              <div className="p-5 sm:p-6 flex items-center justify-between gap-3">
                <CardTitle>Detail Pekerjaan</CardTitle>
                <Link
                  href={`/penjualan/${order.invoice?.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline"
                >
                  <FileText className="w-3.5 h-3.5" /> {order.invoice?.invoiceNumber}
                </Link>
              </div>
              <div className="border-t border-slate-200/80">
                {order.items.map((it, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{it.name}</p>
                      <p className="text-xs text-slate-500">
                        {it.categoryName} · {it.levelName}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-slate-900 whitespace-nowrap">{formatRupiah(it.amount)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3.5 bg-slate-50">
                  <p className="text-sm font-black text-slate-700">Total</p>
                  <p className="text-base font-black text-emerald-700">{formatRupiah(total)}</p>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <PekerjaanBlesscomForm
            principleOptions={options}
            levelOptions={levelOptions}
            initial={{
              id: order.id,
              principleId: order.principle.id,
              workDate: dateInputValue(order.workDate),
              notes: order.notes ?? "",
              items: order.items.map((it) => ({
                name: it.name,
                workPriceItemId: it.workPriceItemId,
                categoryName: it.categoryName,
                levelName: it.levelName,
                amount: it.amount,
                refAmount: it.refAmount,
              })),
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}
