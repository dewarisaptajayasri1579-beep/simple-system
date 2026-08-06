import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/wahub"
import { computeDomainExpiryDate, getExpiryBucket } from "@/lib/domain-status"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"
import { computeAllAccountBalances } from "@/lib/account-balance"

function formatRupiah(amount: number | null | undefined) {
  if (!amount) return "Rp0"
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Reminder harian jam 07:00 WIB ke grup WA internal — ringkasan piutang, domain, biaya
 *  berkala, dan saldo kas/bank keseluruhan. */
export async function runDailyReport() {
  const groupJid = process.env.WAHUB_GROUP_JID
  if (!groupJid) {
    console.warn("[cron] daily-report dilewati: WAHUB_GROUP_JID belum di-set")
    return
  }

  const [domains, bills, openInvoices, balances] = await Promise.all([
    prisma.domain.findMany({ where: { active: true }, include: { client: true } }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } }),
    prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "claimed_paid"] } },
      include: { client: true, payments: true },
    }),
    computeAllAccountBalances(),
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

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000"

  const lines = [
    "📋 *Reminder Harian SEVEN OS*",
    "",
    `💰 *Piutang* — ${invoicesWithRemaining.length} invoice belum lunas, total ${formatRupiah(totalOutstanding)}`,
    ...invoicesWithRemaining.slice(0, 5).map((r) => `  • ${r.inv.client.name} — ${formatRupiah(r.remaining)}`),
    "",
    `🏦 *Saldo Kas & Bank* — ${formatRupiah(totalSaldo)}`,
    "",
    `🌐 *Domain* — ${domainExpired.length} sudah lewat, ${domainExpiring.length} akan habis bulan ini/depan`,
    ...domainExpiring.slice(0, 5).map((r) => `  • ${r.domain.name} (${r.domain.client?.name ?? "tanpa client"})`),
    "",
    `💸 *Biaya Berkala* — ${billsDue.length} perlu dibayar/dicek`,
    ...billsDue.slice(0, 5).map((r) => `  • ${r.bill.name} — ${formatRupiah(r.bill.price)}`),
    "",
    `🔗 Detail lengkap: ${appBaseUrl}/dashboard`,
  ]

  await sendWhatsappMessage(groupJid, lines.join("\n"))
}
