import Link from "next/link"
import { notFound } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { Card } from "@/components/ui"
import { ProjectScheduleTable } from "@/components/proyek/ProjectScheduleTable"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { ArrowLeft } from "lucide-react"

const POSTED_PAYMENTS_WHERE = { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" as const } } }] }

function formatDate(date: Date | null) {
  if (!date) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      schedules: {
        orderBy: { sortOrder: "asc" },
        include: { invoice: { include: { payments: { where: POSTED_PAYMENTS_WHERE } } } },
      },
    },
  })

  if (!project) notFound()

  const scheduleRows = project.schedules.map((s) => ({
    id: s.id,
    label: s.label,
    dueDate: s.dueDate.toISOString(),
    amount: s.amount,
    invoiceId: s.invoiceId,
    invoiceNumber: s.invoice?.invoiceNumber ?? null,
    paid: s.invoice?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0,
  }))

  const totalValue = scheduleRows.reduce((sum, s) => sum + s.amount, 0)
  const totalPaid = scheduleRows.reduce((sum, s) => sum + s.paid, 0)
  const totalRemaining = Math.max(0, totalValue - totalPaid)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-4xl mx-auto">
        <Link href="/proyek" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>

        <Card variant="panel" padding="lg">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900">{project.name}</h1>
              <p className="text-sm text-slate-600 font-semibold mt-1">{project.client.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Periode</p>
              <p className="font-semibold text-slate-800">{formatDate(project.startDate)} - {formatDate(project.endDate)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">PIC</p>
              <p className="font-semibold text-slate-800">{project.picName ?? "-"}{project.picPhone ? ` (${project.picPhone})` : ""}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200/60 text-center">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Nilai Total</p>
              <p className="text-lg font-black text-slate-900">{formatRupiah(totalValue)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Sudah Dibayar</p>
              <p className="text-lg font-black text-emerald-700">{formatRupiah(totalPaid)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase">Sisa Tagih</p>
              <p className="text-lg font-black text-rose-700">{formatRupiah(totalRemaining)}</p>
            </div>
          </div>

          {project.notes && (
            <p className="mt-6 text-sm text-slate-600 border-t border-slate-200/60 pt-4">
              <span className="font-bold">Catatan: </span>
              {project.notes}
            </p>
          )}
        </Card>

        <ProjectScheduleTable projectId={project.id} rows={scheduleRows} />
      </div>
    </AppLayout>
  )
}
