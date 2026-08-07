import { prisma } from "@/lib/prisma"
import { computeDomainExpiryDate, getExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"

/** Ringkasan operasional (piutang, saldo, domain, server, biaya berkala) — dipakai bareng oleh
 *  laporan gambar pagi/sore, pesan teks WA, dan Q&A grup (biar semuanya selalu ngomong angka yang sama). */
export async function getDashboardSnapshot() {
  const [domains, servers, bills, openInvoices, clientCount] = await Promise.all([
    prisma.domain.findMany({ where: { active: true }, include: { client: true } }),
    prisma.server.findMany({ where: { active: true }, include: { period: true, client: true } }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } }),
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] } },
      include: { client: true, payments: true },
    }),
    prisma.client.count(),
  ])

  const domainRows = domains.map((d) => {
    const dueDate = computeDomainExpiryDate(d.lastPaidAt)
    return { domain: d, dueDate, bucket: getExpiryBucket(dueDate) }
  })
  const domainExpiring = domainRows.filter((r) => r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
  const domainExpired = domainRows.filter((r) => r.bucket === "expired")
  const domainDue = [...domainExpired, ...domainExpiring].sort((a, b) => {
    const at = a.dueDate ? a.dueDate.getTime() : Infinity
    const bt = b.dueDate ? b.dueDate.getTime() : Infinity
    return at - bt
  })

  // Server: sama seperti Domain — sudah lewat tempo, atau jatuh tempo bulan ini/depan.
  const serverRows = servers.map((s) => {
    const dueDate = computeNextDueDate(s.lastPaidAt, s.period?.name, s.periodCount)
    return { server: s, dueDate, bucket: getExpiryBucket(dueDate) }
  })
  const serverExpiring = serverRows.filter((r) => r.bucket === "expiring_this_month" || r.bucket === "expiring_next_month")
  const serverExpired = serverRows.filter((r) => r.bucket === "expired")
  const serverDue = [...serverExpired, ...serverExpiring].sort((a, b) => {
    const at = a.dueDate ? a.dueDate.getTime() : Infinity
    const bt = b.dueDate ? b.dueDate.getTime() : Infinity
    return at - bt
  })

  const billRows = bills.map((b) => {
    const dueDate = computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount)
    return { bill: b, dueDate, bucket: getDueBucket(dueDate, b.period?.reminderDaysBefore ?? 7) }
  })
  const billsDue = billRows
    .filter((r) => r.bucket === "overdue" || r.bucket === "due_soon")
    .sort((a, b) => {
      const at = a.dueDate ? a.dueDate.getTime() : Infinity
      const bt = b.dueDate ? b.dueDate.getTime() : Infinity
      return at - bt
    })

  const invoicesWithRemaining = openInvoices
    .map((inv) => ({ inv, remaining: inv.totalAmount - inv.payments.reduce((s, p) => s + p.amount, 0) }))
    .filter((r) => r.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)
  const totalOutstanding = invoicesWithRemaining.reduce((sum, r) => sum + r.remaining, 0)

  // Sengaja dinolkan dulu — akun kas/bank belum diisi transaksi riil (masih saldo awal/seed),
  // jadi angkanya menyesatkan kalau ditampilkan. Balikin ke
  // `Array.from((await computeAllAccountBalances()).values()).reduce((sum, v) => sum + v, 0)`
  // (dari "@/lib/account-balance") begitu data kas/bank-nya sudah valid.
  const totalSaldo = 0

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
      due: domainDue.slice(0, 7).map((r) => ({
        name: r.domain.name,
        clientName: r.domain.client?.name ?? "Internal",
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        price: r.domain.sellPrice,
        overdue: r.bucket === "expired",
      })),
    },
    server: {
      expiredCount: serverExpired.length,
      expiringCount: serverExpiring.length,
      expiring: serverExpiring.slice(0, 5).map((r) => ({ name: r.server.name, clientName: r.server.client?.name ?? "Internal" })),
      due: serverDue.slice(0, 5).map((r) => ({
        name: r.server.name,
        clientName: r.server.client?.name ?? "Internal",
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        price: r.server.price,
        overdue: r.bucket === "expired",
      })),
    },
    biayaBerkala: {
      dueCount: billsDue.length,
      due: billsDue.slice(0, 7).map((r) => ({
        name: r.bill.name,
        price: r.bill.price,
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        overdue: r.bucket === "overdue",
      })),
    },
  }
}

export type DashboardSnapshot = Awaited<ReturnType<typeof getDashboardSnapshot>>
