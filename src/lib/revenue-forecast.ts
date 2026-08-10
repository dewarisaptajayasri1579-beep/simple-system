export interface ForecastItem {
  date: string // ISO
  name: string
  category: "domain" | "server" | "maintenance" | "project"
  amount: number
}

export interface ForecastMonth {
  monthKey: string
  label: string
  domain: number
  server: number
  maintenance: number
  project: number
  total: number
  items: ForecastItem[]
}

const MONTHS_AHEAD = 12

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabel(d: Date) {
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d)
}

/** Prediksi pendapatan per bulan (default 12 bulan/1 tahun ke depan, mulai bulan berjalan) dari 4 sumber:
 *  siklus renewal Domain (tahunan) & Server/Maintenance (sesuai BillingPeriod-nya, bisa lebih
 *  dari 1x muncul di window kalau periodenya bulanan), plus jadwal termin Project yang sudah
 *  jatuh tempo di window ini. Item yang sudah lewat tempo (overdue) di-"lompatkan" ke kemunculan
 *  berikutnya yang jatuh di window — bukan dihitung 2x di masa lalu, ini prediksi ke depan.
 *  Tiap kemunculan disimpan sebagai baris di `ForecastMonth.items` (bukan cuma agregat per
 *  kategori) supaya bisa ditampilkan rinci per item (tanggal, nama, nominal) di UI. */
export function buildRevenueForecast(input: {
  domains: { name: string; price: number; expiry: Date | null }[]
  servers: { name: string; price: number; nextDue: Date | null; periodMonths: number }[]
  maintenances: { name: string; price: number; nextDue: Date | null; periodMonths: number }[]
  projectSchedules: { name: string; amount: number; dueDate: Date }[]
  reference?: Date
  monthsAhead?: number
}): ForecastMonth[] {
  const reference = input.reference ?? new Date()
  const monthsAhead = input.monthsAhead ?? MONTHS_AHEAD
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1)
  const windowEnd = new Date(start.getFullYear(), start.getMonth() + monthsAhead, 1)

  const months: ForecastMonth[] = []
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    months.push({ monthKey: monthKey(d), label: monthLabel(d), domain: 0, server: 0, maintenance: 0, project: 0, total: 0, items: [] })
  }

  const addAmount = (date: Date, name: string, category: ForecastItem["category"], amount: number) => {
    const key = monthKey(date)
    const bucket = months.find((m) => m.monthKey === key)
    if (bucket) {
      bucket[category] += amount
      bucket.total += amount
      bucket.items.push({ date: date.toISOString(), name, category, amount })
    }
  }

  for (const d of input.domains) {
    if (!d.expiry || d.price <= 0) continue
    const occurrence = new Date(d.expiry)
    let guard = 0
    while (occurrence < start && guard < 20) {
      occurrence.setFullYear(occurrence.getFullYear() + 1)
      guard++
    }
    guard = 0
    while (occurrence < windowEnd && guard < 10) {
      addAmount(occurrence, d.name, "domain", d.price)
      occurrence.setFullYear(occurrence.getFullYear() + 1)
      guard++
    }
  }

  const projectRecurring = (items: { name: string; price: number; nextDue: Date | null; periodMonths: number }[], category: "server" | "maintenance") => {
    for (const item of items) {
      if (!item.nextDue || item.price <= 0 || item.periodMonths <= 0) continue
      const occurrence = new Date(item.nextDue)
      let guard = 0
      while (occurrence < start && guard < 60) {
        occurrence.setMonth(occurrence.getMonth() + item.periodMonths)
        guard++
      }
      guard = 0
      while (occurrence < windowEnd && guard < 24) {
        addAmount(occurrence, item.name, category, item.price)
        occurrence.setMonth(occurrence.getMonth() + item.periodMonths)
        guard++
      }
    }
  }
  projectRecurring(input.servers, "server")
  projectRecurring(input.maintenances, "maintenance")

  for (const s of input.projectSchedules) {
    if (s.dueDate >= start && s.dueDate < windowEnd) addAmount(s.dueDate, s.name, "project", s.amount)
  }

  return months
}
