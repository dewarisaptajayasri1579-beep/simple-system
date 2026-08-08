import { AppLayout } from "@/components/layout/AppLayout"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeAllAccountBalances } from "@/lib/account-balance"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

export default async function NeracaPage() {
  const user = await requirePageRole(["owner", "direktur"])

  const [balances, invoices, bills, servers] = await Promise.all([
    computeAllAccountBalances(),
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] }, postStatus: "posted" },
      include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } },
    }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } }),
    prisma.server.findMany({ where: { active: true }, include: { period: true } }),
  ])

  const kasBankTotal = Array.from(balances.values()).reduce((s, v) => s + v, 0)
  const piutangTotal = invoices.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    return sum + Math.max(0, inv.totalAmount - paid)
  }, 0)

  const overdueBillsTotal = bills
    .filter((b) => getDueBucket(computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount), b.period?.reminderDaysBefore ?? 7) === "overdue")
    .reduce((sum, b) => sum + (b.price ?? 0), 0)
  const overdueServersTotal = servers
    .filter((s) => getDueBucket(computeNextDueDate(s.lastPaidAt, s.period?.name, s.periodCount), s.period?.reminderDaysBefore ?? 7) === "overdue")
    .reduce((sum, s) => sum + (s.price ?? 0), 0)

  // PPN yang sudah masuk lewat pembayaran tapi belum tentu disetor ke kantor pajak — dihitung
  // proporsional dari porsi invoice yang sudah dibayar (informatif, bukan pembukuan pajak resmi).
  const allInvoicesWithPpn = await prisma.invoice.findMany({
    where: { ppnAmount: { gt: 0 }, postStatus: "posted" },
    include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } },
  })
  const ppnCollected = allInvoicesWithPpn.reduce((sum, inv) => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
    const portion = inv.totalAmount > 0 ? (paid / inv.totalAmount) * inv.ppnAmount : 0
    return sum + portion
  }, 0)

  const asetTotal = kasBankTotal + piutangTotal
  const liabilitasTotal = overdueBillsTotal + overdueServersTotal + ppnCollected
  const ekuitas = asetTotal - liabilitasTotal

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Neraca</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Ringkas/manajerial (bukan pembukuan double-entry penuh) — per hari ini.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card variant="panel" padding="lg">
            <CardHeader>
              <CardTitle>Aset</CardTitle>
            </CardHeader>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Kas &amp; Bank</span>
                <span className="font-semibold">{formatRupiah(kasBankTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Piutang (belum lunas)</span>
                <span className="font-semibold">{formatRupiah(piutangTotal)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-2 border-t border-slate-200/60">
                <span>Total Aset</span>
                <span>{formatRupiah(asetTotal)}</span>
              </div>
            </div>
          </Card>

          <Card variant="panel" padding="lg">
            <CardHeader>
              <CardTitle>Liabilitas</CardTitle>
            </CardHeader>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Biaya Berkala Lewat Tempo</span>
                <span className="font-semibold">{formatRupiah(overdueBillsTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Server Lewat Tempo</span>
                <span className="font-semibold">{formatRupiah(overdueServersTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">PPN Terkumpul (informatif)</span>
                <span className="font-semibold">{formatRupiah(ppnCollected)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-2 border-t border-slate-200/60">
                <span>Total Liabilitas</span>
                <span>{formatRupiah(liabilitasTotal)}</span>
              </div>
            </div>
          </Card>
        </div>

        <Card variant="feature" padding="lg">
          <div className="flex justify-between items-center">
            <CardDescription>Ekuitas (Aset - Liabilitas)</CardDescription>
            <p className="text-2xl font-black text-slate-900">{formatRupiah(ekuitas)}</p>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
