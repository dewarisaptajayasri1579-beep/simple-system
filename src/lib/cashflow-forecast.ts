import { jakartaTodayDateIso, jakartaIsoWeekday, parseJakartaDateIso, shiftJakartaDateIso } from "./datetime"
import { computeNextDueDate } from "./recurring-bill-status"

export type CashflowStatus = "belum_ditagih" | "sudah_ditagih" | "lunas"
export type CashflowCategory = "domain" | "server" | "maintenance" | "project" | "piutang" | "biaya_berkala"

export interface CashflowItem {
  date: string // ISO
  name: string
  category: CashflowCategory
  amount: number
  direction: "in" | "out"
  status: CashflowStatus | null // null kalau kategori tidak punya konsep "ditagih" (biaya_berkala, project)
}

export interface CashflowWeek {
  weekStart: string // "YYYY-MM-DD", Senin
  weekEnd: string // "YYYY-MM-DD", Minggu
  label: string
  openingBalance: number
  income: number
  expense: number
  net: number
  closingBalance: number
  items: CashflowItem[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_OCCURRENCES = 60 // pengaman infinite loop, jauh lebih dari cukup buat window 8 minggu

function weekLabel(startIso: string, endIso: string) {
  const fmt = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(parseJakartaDateIso(iso))
  return `${fmt(startIso)} – ${fmt(endIso)}`
}

/** Advance +1 tahun (buat renewal Domain, siklusnya selalu tahunan). */
function addYear(date: Date): Date {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + 1)
  return next
}

export interface CashflowRecurringInput {
  name: string
  price: number
  nextDue: Date | null
  periodName: string | null
  periodCount: number | null
  status: CashflowStatus
}

export interface CashflowForecastInput {
  openingBalance: number
  domains: { name: string; price: number; expiry: Date | null; status: CashflowStatus }[]
  servers: CashflowRecurringInput[]
  maintenances: CashflowRecurringInput[]
  recurringBills: { name: string; price: number; nextDue: Date | null; periodName: string | null; periodCount: number | null }[]
  piutang: { name: string; amount: number; dueDate: Date }[]
  projectSchedules: { name: string; amount: number; dueDate: Date }[]
  reference?: Date
  weeksAhead?: number
}

/** Proyeksi arus kas per minggu (default 8 minggu ke depan, mulai Senin minggu berjalan) dari
 *  6 sumber: renewal Domain (tahunan)/Server/Maintenance (sesuai BillingPeriod-nya, termasuk
 *  Mingguan) sebagai Pemasukan, Biaya Berkala sebagai Pengeluaran, plus Piutang yang sudah
 *  jatuh tempo dan termin Project.
 *
 *  Item pertama tiap entity recurring (Domain/Server/Maintenance/Biaya Berkala) DIBIARKAN apa
 *  adanya walau tanggalnya sudah lewat "start" — biar item yang lewat tempo tetap kelihatan
 *  jatuh di minggu berjalan (bucket ke-0), bukan hilang atau dilompatkan ke siklus berikutnya
 *  (sama filosofi dengan bucket "lewat tempo" di Dashboard). Siklus berikutnya (proyeksi murni
 *  ke depan) baru mulai dihitung setelah occurrence >= start. Status "belum_ditagih/sudah_
 *  ditagih/lunas" cuma di-attach ke siklus PERTAMA — siklus berikutnya default "belum_ditagih"
 *  karena memang belum ada tagihan yang mulai buat renewal yang masih jauh. */
export function buildCashflowForecast(input: CashflowForecastInput): CashflowWeek[] {
  const reference = input.reference ?? new Date()
  const weeksAhead = input.weeksAhead ?? 8

  const todayIso = jakartaTodayDateIso(reference)
  const weekday = jakartaIsoWeekday(todayIso) // 1=Senin..7=Minggu
  const mondayIso = shiftJakartaDateIso(todayIso, -(weekday - 1))
  const start = parseJakartaDateIso(mondayIso)
  const windowEnd = new Date(start.getTime() + weeksAhead * WEEK_MS)

  const weeks: CashflowWeek[] = []
  for (let i = 0; i < weeksAhead; i++) {
    const weekStartIso = shiftJakartaDateIso(mondayIso, i * 7)
    const weekEndIso = shiftJakartaDateIso(mondayIso, i * 7 + 6)
    weeks.push({
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      label: weekLabel(weekStartIso, weekEndIso),
      openingBalance: 0,
      income: 0,
      expense: 0,
      net: 0,
      closingBalance: 0,
      items: [],
    })
  }

  const weekIndexOf = (date: Date) => {
    const diff = date.getTime() - start.getTime()
    if (diff < 0) return 0
    return Math.min(weeksAhead - 1, Math.floor(diff / WEEK_MS))
  }

  const addItem = (date: Date, name: string, category: CashflowCategory, amount: number, direction: "in" | "out", status: CashflowStatus | null) => {
    if (date.getTime() >= windowEnd.getTime()) return
    const week = weeks[weekIndexOf(date)]
    week.items.push({ date: date.toISOString(), name, category, amount, direction, status })
    if (direction === "in") week.income += amount
    else week.expense += amount
  }

  /** Emit occurrence pertama apa adanya (bisa lewat tempo, ke-clamp minggu-0 lewat weekIndexOf),
   *  lalu occurrence berikutnya hasil `advance()` berulang selama masih di dalam window. */
  const walkRecurring = (
    items: CashflowRecurringInput[],
    category: "server" | "maintenance" | "biaya_berkala",
    direction: "in" | "out"
  ) => {
    for (const item of items) {
      if (!item.nextDue || item.price <= 0) continue
      const advance = (d: Date) => computeNextDueDate(d, item.periodName ?? undefined, item.periodCount) ?? d
      const firstStatus = direction === "in" ? item.status : null

      addItem(item.nextDue, item.name, category, item.price, direction, firstStatus)

      let cursor = advance(item.nextDue)
      let guard = 0
      while (cursor.getTime() < start.getTime() && guard < MAX_OCCURRENCES) {
        cursor = advance(cursor)
        guard++
      }
      guard = 0
      while (cursor.getTime() < windowEnd.getTime() && guard < MAX_OCCURRENCES) {
        addItem(cursor, item.name, category, item.price, direction, direction === "in" ? "belum_ditagih" : null)
        cursor = advance(cursor)
        guard++
      }
    }
  }

  walkRecurring(input.servers, "server", "in")
  walkRecurring(input.maintenances, "maintenance", "in")
  walkRecurring(
    input.recurringBills.map((b) => ({ ...b, status: "belum_ditagih" as CashflowStatus })),
    "biaya_berkala",
    "out"
  )

  for (const d of input.domains) {
    if (!d.expiry || d.price <= 0) continue
    addItem(d.expiry, d.name, "domain", d.price, "in", d.status)

    let cursor = addYear(d.expiry)
    let guard = 0
    while (cursor.getTime() < start.getTime() && guard < MAX_OCCURRENCES) {
      cursor = addYear(cursor)
      guard++
    }
    guard = 0
    while (cursor.getTime() < windowEnd.getTime() && guard < MAX_OCCURRENCES) {
      addItem(cursor, d.name, "domain", d.price, "in", "belum_ditagih")
      cursor = addYear(cursor)
      guard++
    }
  }

  for (const p of input.piutang) {
    if (p.amount <= 0) continue
    addItem(p.dueDate, p.name, "piutang", p.amount, "in", "sudah_ditagih")
  }
  for (const s of input.projectSchedules) {
    if (s.amount <= 0) continue
    addItem(s.dueDate, s.name, "project", s.amount, "in", null)
  }

  let carry = input.openingBalance
  for (const week of weeks) {
    week.openingBalance = carry
    week.net = week.income - week.expense
    week.closingBalance = week.openingBalance + week.net
    carry = week.closingBalance
  }

  return weeks
}
