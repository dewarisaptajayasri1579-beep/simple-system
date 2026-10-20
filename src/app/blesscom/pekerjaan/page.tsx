import Link from "next/link"
import { Plus } from "lucide-react"

import { AppLayout } from "@/components/layout/AppLayout"
import { DaftarPekerjaanTable, type PekerjaanRow } from "@/components/blesscom/DaftarPekerjaanTable"
import { Button } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Tabel transaksi terus tumbuh — ambil yang terbaru saja (filter & paging masih di client). */
const LIST_LIMIT = 300

export default async function DaftarPekerjaanBlesscomPage() {
  const user = await getCurrentUser()

  const orders = await prisma.blesscomWorkOrder.findMany({
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: LIST_LIMIT,
    select: {
      id: true,
      workDate: true,
      invoiceId: true,
      invoice: { select: { invoiceNumber: true } },
      principle: { select: { name: true, company: { select: { name: true } } } },
      _count: { select: { items: true } },
    },
  })

  // Total nominal per transaksi — satu groupBy untuk semua baris sekaligus (bukan query per row),
  // dan penjumlahannya di database, bukan tarik semua detail ke JS.
  const totals = await prisma.blesscomWorkOrderItem.groupBy({
    by: ["workOrderId"],
    where: { workOrderId: { in: orders.map((o) => o.id) } },
    _sum: { amount: true },
  })
  const totalByOrder = new Map(totals.map((t) => [t.workOrderId, t._sum.amount ?? 0]))

  const rows: PekerjaanRow[] = orders.map((o) => ({
    id: o.id,
    workDate: o.workDate.toISOString(),
    principleName: o.principle.name,
    companyName: o.principle.company.name,
    itemCount: o._count.items,
    total: totalByOrder.get(o.id) ?? 0,
    invoiceId: o.invoiceId,
    invoiceNumber: o.invoice?.invoiceNumber ?? null,
  }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Daftar Pekerjaan</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
              Pencatatan pekerjaan per principle — tanggal, level, dan nominalnya.
            </p>
          </div>
          <Link href="/blesscom/pekerjaan/baru">
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
              Tambah Transaksi
            </Button>
          </Link>
        </div>

        <DaftarPekerjaanTable rows={rows} />
      </div>
    </AppLayout>
  )
}
