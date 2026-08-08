import { AppLayout } from "@/components/layout/AppLayout"
import { PiutangList, type PiutangClientGroup } from "@/components/piutang/PiutangList"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function PiutangPage() {
  const user = await getCurrentUser()

  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["unpaid", "partial", "claimed_paid"] }, postStatus: "posted" },
    include: {
      client: true,
      payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } },
    },
    orderBy: { dueDate: "asc" },
  })

  const groupsMap = new Map<string, PiutangClientGroup>()
  for (const inv of invoices) {
    const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, inv.totalAmount - paid)
    if (remaining <= 0) continue

    const group = groupsMap.get(inv.clientId) ?? {
      clientId: inv.clientId,
      clientName: inv.client.name,
      picName: inv.client.picName,
      picPhone: inv.client.picPhone,
      invoices: [],
      totalRemaining: 0,
    }
    group.invoices.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount: inv.totalAmount,
      status: inv.status,
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      paid,
      remaining,
    })
    group.totalRemaining += remaining
    groupsMap.set(inv.clientId, group)
  }

  const groups = Array.from(groupsMap.values()).sort((a, b) => b.totalRemaining - a.totalRemaining)
  const totalOutstanding = groups.reduce((sum, g) => sum + g.totalRemaining, 0)

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Piutang</h1>
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Daftar tagih — siapa saja yang masih berhutang.</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-500 uppercase">Total Outstanding</p>
            <p className="text-2xl font-black text-rose-700">
              {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalOutstanding)}
            </p>
          </div>
        </div>

        <PiutangList groups={groups} />
      </div>
    </AppLayout>
  )
}
