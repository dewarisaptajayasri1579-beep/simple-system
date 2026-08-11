import { AppLayout } from "@/components/layout/AppLayout"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeAllAccountBalances } from "@/lib/account-balance"
import { resolveDomainExpiry } from "@/lib/domain-status"
import { resolveServerExpiry, computeNextDueDate } from "@/lib/recurring-bill-status"
import { buildCashflowForecast, type CashflowStatus } from "@/lib/cashflow-forecast"
import { ArusKasSection } from "@/components/laporan/ArusKasSection"

type FollowUpRefType = "domain" | "server" | "maintenance"

export default async function ArusKasPage() {
  const user = await getCurrentUser()

  const [domains, servers, maintenances, recurringBills, invoices, projectSchedules, balances] = await Promise.all([
    prisma.domain.findMany({ where: { active: true, clientId: { not: null } }, include: { client: true } }),
    prisma.server.findMany({ where: { active: true, clientId: { not: null } }, include: { period: true, client: true } }),
    prisma.maintenance.findMany({ where: { active: true }, include: { period: true, client: true } }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } }),
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] }, postStatus: "posted" },
      include: { client: true, payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } },
    }),
    prisma.projectPaymentSchedule.findMany({
      where: { project: { status: "berjalan" } },
      select: { amount: true, dueDate: true, label: true, project: { select: { name: true } } },
    }),
    computeAllAccountBalances(),
  ])

  const openingBalance = Array.from(balances.values()).reduce((sum, b) => sum + b, 0)

  // Status Belum Ditagih/Sudah Ditagih/Lunas per Domain/Server/Maintenance — reuse siklus
  // BillingFollowUp yang sama dipakai badge SLA Dashboard (lihat lib/billing-follow-up.ts),
  // TANPA filter paidRecordedAt supaya siklus yang baru aja lunas juga ke-detect.
  const followUpRefs = [
    ...domains.map((d) => ({ refType: "domain" as FollowUpRefType, refId: d.id })),
    ...servers.map((s) => ({ refType: "server" as FollowUpRefType, refId: s.id })),
    ...maintenances.map((m) => ({ refType: "maintenance" as FollowUpRefType, refId: m.id })),
  ]
  const followUps =
    followUpRefs.length > 0
      ? await prisma.billingFollowUp.findMany({
          where: { OR: followUpRefs.map((r) => ({ refType: r.refType, refId: r.refId })) },
          orderBy: { createdAt: "desc" },
        })
      : []
  const latestFollowUpByRef = new Map<string, (typeof followUps)[number]>()
  for (const f of followUps) {
    const key = `${f.refType}:${f.refId}`
    if (!latestFollowUpByRef.has(key)) latestFollowUpByRef.set(key, f)
  }
  const statusFor = (refType: FollowUpRefType, refId: string): CashflowStatus => {
    const record = latestFollowUpByRef.get(`${refType}:${refId}`)
    if (!record) return "belum_ditagih"
    if (record.paidRecordedAt) return "lunas"
    if (record.invoicedAt) return "sudah_ditagih"
    return "belum_ditagih"
  }

  const weeks = buildCashflowForecast({
    openingBalance,
    domains: domains.map((d) => ({
      name: `${d.name}${d.client ? ` — ${d.client.name}` : ""}`,
      price: d.sellPrice ?? 0,
      expiry: resolveDomainExpiry(d),
      status: statusFor("domain", d.id),
    })),
    servers: servers.map((s) => ({
      name: `${s.name}${s.client ? ` — ${s.client.name}` : ""}`,
      price: s.price ?? 0,
      nextDue: resolveServerExpiry(s),
      periodName: s.period?.name ?? null,
      periodCount: s.periodCount,
      status: statusFor("server", s.id),
    })),
    maintenances: maintenances.map((m) => ({
      name: `${m.name} — ${m.client.name}`,
      price: m.price ?? 0,
      nextDue: computeNextDueDate(m.lastPaidAt, m.period?.name, m.periodCount),
      periodName: m.period?.name ?? null,
      periodCount: m.periodCount,
      status: statusFor("maintenance", m.id),
    })),
    recurringBills: recurringBills.map((b) => ({
      name: b.name,
      price: b.price ?? 0,
      nextDue: computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount),
      periodName: b.period?.name ?? null,
      periodCount: b.periodCount,
    })),
    piutang: invoices
      .map((inv) => {
        const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0)
        return { name: `${inv.invoiceNumber} — ${inv.client.name}`, amount: Math.max(0, inv.totalAmount - paid), dueDate: inv.dueDate }
      })
      .filter((r): r is { name: string; amount: number; dueDate: Date } => r.dueDate !== null && r.amount > 0),
    projectSchedules: projectSchedules.map((s) => ({ name: `${s.project.name} — ${s.label}`, amount: s.amount, dueDate: s.dueDate })),
    weeksAhead: 8,
  })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Arus Kas Mingguan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Proyeksi Pemasukan (Piutang, renewal Domain/Server/Maintenance, termin Project) vs Pengeluaran (Biaya Berkala) 8 minggu ke depan, dengan saldo kas/bank berjalan.
          </p>
        </div>

        <ArusKasSection weeks={weeks} />
      </div>
    </AppLayout>
  )
}
