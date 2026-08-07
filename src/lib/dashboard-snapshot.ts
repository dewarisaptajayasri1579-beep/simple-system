import { prisma } from "@/lib/prisma"
import { computeDomainExpiryDate, getExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"
import { computeAllAccountBalances } from "@/lib/account-balance"

/** Ringkasan operasional (piutang, saldo, domain, biaya berkala) — dipakai bareng oleh laporan
 *  gambar pagi/sore, pesan teks WA, dan Q&A grup (biar semuanya selalu ngomong angka yang sama). */
export async function getDashboardSnapshot() {
  const [domains, bills, openInvoices, balances, clientCount] = await Promise.all([
    prisma.domain.findMany({ where: { active: true }, include: { client: true } }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } }),
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] } },
      include: { client: true, payments: true },
    }),
    computeAllAccountBalances(),
    prisma.client.count(),
  ])

  const domainRows = domains.map((d) => ({ domain: d, bucket: getExpiryBucket(computeDomainExpiryDate(d.lastPaidAt)) }))
  const domainExpiring = domainRows.filter((r) => r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
  const domainExpired = domainRows.filter((r) => r.bucket === "expired")

  const billRows = bills.map((b) => ({
    bill: b,
    bucket: getDueBucket(computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount), b.period?.reminderDaysBefore ?? 7),
  }))
  const billsDue = billRows.filter((r) => r.bucket === "overdue" || r.bucket === "due_soon")

  const invoicesWithRemaining = openInvoices
    .map((inv) => ({ inv, remaining: inv.totalAmount - inv.payments.reduce((s, p) => s + p.amount, 0) }))
    .filter((r) => r.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)
  const totalOutstanding = invoicesWithRemaining.reduce((sum, r) => sum + r.remaining, 0)

  const totalSaldo = Array.from(balances.values()).reduce((sum, v) => sum + v, 0)

  return {
    clientCount,
    totalSaldo,
    piutang: {
      count: invoicesWithRemaining.length,
      total: totalOutstanding,
      top: invoicesWithRemaining.slice(0, 5).map((r) => ({ clientName: r.inv.client.name, remaining: r.remaining })),
    },
    domain: {
      expiredCount: domainExpired.length,
      expiringCount: domainExpiring.length,
      expiring: domainExpiring.slice(0, 5).map((r) => ({ name: r.domain.name, clientName: r.domain.client?.name ?? "Internal" })),
    },
    biayaBerkala: {
      dueCount: billsDue.length,
      due: billsDue.slice(0, 5).map((r) => ({ name: r.bill.name, price: r.bill.price })),
    },
  }
}

export type DashboardSnapshot = Awaited<ReturnType<typeof getDashboardSnapshot>>
