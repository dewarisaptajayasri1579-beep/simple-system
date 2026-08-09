import Link from "next/link"
import { AppLayout } from "@/components/layout/AppLayout"
import { Button } from "@/components/ui"
import { ProjectListTable } from "@/components/proyek/ProjectListTable"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { Plus } from "lucide-react"

const POSTED_PAYMENTS_WHERE = { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" as const } } }] }

export default async function ProyekPage() {
  const user = await getCurrentUser()

  const projects = await prisma.project.findMany({
    include: {
      client: true,
      schedules: { include: { invoice: { include: { payments: { where: POSTED_PAYMENTS_WHERE } } } } },
    },
    orderBy: { startDate: "desc" },
  })

  const rows = projects.map((p) => {
    const totalValue = p.schedules.reduce((sum, s) => sum + s.amount, 0)
    const totalPaid = p.schedules.reduce(
      (sum, s) => sum + (s.invoice?.payments.reduce((pSum, pay) => pSum + pay.amount, 0) ?? 0),
      0
    )
    return {
      id: p.id,
      name: p.name,
      clientName: p.client.name,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate ? p.endDate.toISOString() : null,
      status: p.status,
      totalValue,
      remaining: Math.max(0, totalValue - totalPaid),
    }
  })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Proyek</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Project & jadwal pembayaran termin.</p>
          </div>
          <Link href="/proyek/baru">
            <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>
              Buat Proyek
            </Button>
          </Link>
        </div>

        <ProjectListTable rows={rows} />
      </div>
    </AppLayout>
  )
}
