import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/wahub"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

/** Cek biaya berkala yang jatuh tempo dalam rentang reminder (BillingPeriod.reminderDaysBefore),
 *  kirim WA tanya "sudah dibayar?" ke staf — balasannya diproses lewat AI Agent
 *  (get_pending_bill_checkins / mark_recurring_bill_paid, lihat lib/agent-tools.ts). Cuma
 *  ditanyakan sekali per hari per item (klaim atomic pola remindedAt). */
export async function runRecurringBillReminders() {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [bills, staff] = await Promise.all([
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true } }),
    prisma.user.findMany({ where: { phoneNumber: { not: null } } }),
  ])

  if (staff.length === 0) return

  const due = bills.filter((b) => {
    const bucket = getDueBucket(computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount), b.period?.reminderDaysBefore ?? 7)
    if (bucket === "ok") return false
    if (b.lastCheckinAt && b.lastCheckinAt >= today) return false // sudah ditanya hari ini
    return true
  })

  for (const bill of due) {
    const claim = await prisma.recurringBill.updateMany({
      where: { id: bill.id, OR: [{ lastCheckinAt: null }, { lastCheckinAt: { lt: today } }] },
      data: { lastCheckinAt: now },
    })
    if (claim.count === 0) continue

    const message = [
      `Reminder biaya berkala: *${bill.name}* (${formatRupiah(bill.price ?? 0)}) sudah/segera jatuh tempo.`,
      "",
      `Sudah dibayar? Balas "sudah ${bill.name}" atau "belum" ya.`,
    ].join("\n")

    for (const s of staff) {
      try {
        await sendWhatsappMessage(s.phoneNumber!, message)
      } catch (error) {
        console.error(`[cron] Gagal kirim reminder biaya berkala ke ${s.name}:`, error)
      }
    }
  }
}
