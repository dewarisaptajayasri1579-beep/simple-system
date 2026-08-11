import { redirect } from "next/navigation"
import { AppLayout } from "@/components/layout/AppLayout"
import { getSessionUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getExpiryBucket } from "@/lib/domain-status"
import { jakartaTodayRange, parseJakartaDateIso } from "@/lib/datetime"
import { computeNextDueDate, getDueBucket } from "@/lib/recurring-bill-status"
import { RecurringDueSection, type RecurringDueRow } from "@/components/dashboard/DashboardSections"
import { DashboardDateRangeFilter } from "@/components/dashboard/DashboardDateRangeFilter"

function byDueDateAsc<T extends { dueDate: string | null }>(a: T, b: T) {
  const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
  const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
  return aTime - bTime
}

export default async function DashboardFinancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const params = await searchParams
  // Filter rentang tanggal jatuh tempo (opsional, lihat DashboardDateRangeFilter) — kalau diisi,
  // ganti window bawaan (bulan ini/lewat tempo) dengan SEMUA biaya jatuh tempo dalam rentang ini.
  const dateFromIso = params.from || ""
  const dateToIso = params.to || ""
  const hasDateRange = Boolean(dateFromIso || dateToIso)
  const rangeStart = dateFromIso ? jakartaTodayRange(parseJakartaDateIso(dateFromIso)).start : null
  const rangeEnd = dateToIso ? jakartaTodayRange(parseJakartaDateIso(dateToIso)).end : null
  const inDateRange = (dueDate: string | null) => {
    if (!dueDate) return false
    const t = new Date(dueDate).getTime()
    if (rangeStart && t < rangeStart.getTime()) return false
    if (rangeEnd && t >= rangeEnd.getTime()) return false
    return true
  }

  const [accounts, bills] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.recurringBill.findMany({ where: { active: true }, include: { period: true, vendor: true } }),
  ])

  // Biaya Rutin: biaya berkala yang jatuh tempo bulan ini (kalender), plus yang sudah lewat tempo
  // — dipindahkan dari Dashboard utama ke halaman sendiri supaya Dashboard tidak terlalu padat.
  const recurringDueRows: RecurringDueRow[] = bills
    .map((b) => {
      const nextDue = computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount)
      return {
        id: b.id,
        name: b.name,
        identifier: b.identifier,
        category: b.category,
        vendorName: b.vendor?.name ?? null,
        price: b.price,
        dueDate: nextDue ? nextDue.toISOString() : null,
        bucket: getExpiryBucket(nextDue),
      }
    })
    .filter((r) => (hasDateRange ? inDateRange(r.dueDate) : r.bucket === "expiring_this_month" || r.bucket === "expired"))
    .sort(byDueDateAsc)

  const billBuckets = bills.map((b) => getDueBucket(computeNextDueDate(b.lastPaidAt, b.period?.name, b.periodCount), b.period?.reminderDaysBefore ?? 7))
  const billOverdue = billBuckets.filter((b) => b === "overdue").length
  const billDueSoon = billBuckets.filter((b) => b === "due_soon").length

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard Finance</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Biaya rutin (langganan/berkala) yang jatuh tempo bulan ini atau sudah lewat tempo — {billOverdue} lewat tempo, {billDueSoon} jatuh tempo bulan ini.
          </p>
        </div>

        <DashboardDateRangeFilter fromIso={dateFromIso} toIso={dateToIso} />

        <RecurringDueSection rows={recurringDueRows} accounts={accounts} isOwner={user.role === "owner"} rangeActive={hasDateRange} />
      </div>
    </AppLayout>
  )
}
