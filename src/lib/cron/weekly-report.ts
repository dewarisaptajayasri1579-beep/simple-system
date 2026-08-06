import { prisma } from "@/lib/prisma"
import { sendWhatsappMessage } from "@/lib/wahub"
import { computeAllAccountBalances } from "@/lib/account-balance"

function formatRupiah(amount: number | null | undefined) {
  if (!amount) return "Rp0"
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Rekap mingguan jam 07:30 WIB tiap Senin — pendapatan/pengeluaran & split minggu lalu,
 *  plus saldo akhir kas/bank. */
export async function runWeeklyReport() {
  const groupJid = process.env.WAHUB_GROUP_JID
  if (!groupJid) {
    console.warn("[cron] weekly-report dilewati: WAHUB_GROUP_JID belum di-set")
    return
  }

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [transactions, balances] = await Promise.all([
    prisma.transaction.findMany({ where: { occurredAt: { gte: weekAgo, lte: now } } }),
    computeAllAccountBalances(),
  ])

  const income = transactions.filter((t) => t.type === "income")
  const expense = transactions.filter((t) => t.type === "expense")

  const totalIncomeNet = income.reduce((s, t) => s + t.netAmount, 0)
  const totalExpense = expense.reduce((s, t) => s + t.grossAmount, 0)
  const totalOperasional = income.reduce((s, t) => s + (t.operasionalAmount ?? 0), 0)
  const totalDireksi = income.reduce((s, t) => s + (t.direksiAmount ?? 0), 0)
  const totalBonus = income.reduce((s, t) => s + (t.bonusAmount ?? 0), 0)
  const totalSaldo = Array.from(balances.values()).reduce((sum, v) => sum + v, 0)

  const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000"

  const lines = [
    "📊 *Rekap Mingguan SEVEN OS*",
    "",
    `Pemasukan Bersih: ${formatRupiah(totalIncomeNet)}`,
    `Pengeluaran: ${formatRupiah(totalExpense)}`,
    "",
    `Split minggu ini — Operasional: ${formatRupiah(totalOperasional)} | Direksi: ${formatRupiah(totalDireksi)} | Bonus: ${formatRupiah(totalBonus)}`,
    "",
    `Saldo Kas & Bank saat ini: ${formatRupiah(totalSaldo)}`,
    "",
    `🔗 Detail: ${appBaseUrl}/laporan/keuangan`,
  ]

  await sendWhatsappMessage(groupJid, lines.join("\n"))
}
