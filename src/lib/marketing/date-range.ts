import { jakartaTodayDateIso, parseJakartaDateIso, shiftJakartaDateIso } from "@/lib/datetime"

/**
 * Preset rentang tanggal untuk filter daftar Lead & Inbox.
 *
 * Semua perhitungan pakai tanggal kalender JAKARTA, bukan UTC — "hari ini" buat Sales di WIB
 * harus berarti 00:00-23:59 WIB, bukan 07:00 hari ini sampai 07:00 besok. Preset disimpan sebagai
 * kata kunci ("today", "week", …) bukan tanggal hasil hitungan, supaya kalau halaman dibuka lagi
 * besok (atau di-Back dari detail), "Hari ini" tetap berarti hari itu — bukan tanggal kemarin
 * yang beku di URL.
 */
export type DateRangePreset = "all" | "today" | "yesterday" | "week" | "month" | "custom"

export const DATE_RANGE_LABEL: Record<DateRangePreset, string> = {
  all: "Semua Tanggal",
  today: "Hari Ini",
  yesterday: "Kemarin",
  week: "Minggu Ini",
  month: "Bulan Ini",
  custom: "Pilih Tanggal",
}

/** Awal minggu = SENIN (konvensi kerja di sini, sama dengan jakartaCurrentWeek di lib/datetime). */
function startOfJakartaWeekIso(todayIso: string): string {
  const noon = parseJakartaDateIso(todayIso)
  const jsWeekday = new Date(noon.getTime() + 7 * 3600 * 1000).getUTCDay() // 0=Min .. 6=Sab
  const mondayOffset = jsWeekday === 0 ? -6 : 1 - jsWeekday
  return shiftJakartaDateIso(todayIso, mondayOffset)
}

/**
 * Terjemahkan preset jadi rentang tanggal Jakarta "YYYY-MM-DD" (inklusif dua-duanya).
 * `all` → null (tanpa filter). `custom` pakai `from`/`to` apa adanya; kalau salah satunya kosong,
 * sisi itu dibiarkan terbuka.
 */
export function resolveDateRangePreset(
  preset: DateRangePreset,
  custom?: { from?: string | null; to?: string | null },
  reference: Date = new Date()
): { from: string | null; to: string | null } | null {
  const today = jakartaTodayDateIso(reference)
  switch (preset) {
    case "today":
      return { from: today, to: today }
    case "yesterday": {
      const y = shiftJakartaDateIso(today, -1)
      return { from: y, to: y }
    }
    case "week":
      return { from: startOfJakartaWeekIso(today), to: today }
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today }
    case "custom": {
      const from = custom?.from || null
      const to = custom?.to || null
      return from || to ? { from, to } : null
    }
    default:
      return null
  }
}

/**
 * Rentang tanggal Jakarta → instant UTC buat dipakai di `where` Prisma.
 * `to` di-set ke AWAL hari berikutnya dan dibandingkan dengan `lt` (bukan `lte` jam 23:59:59),
 * supaya baris yang jatuh di detik-detik terakhir hari itu tidak terlewat.
 */
export function jakartaDateRangeToInstants(range: { from: string | null; to: string | null }): {
  gte?: Date
  lt?: Date
} {
  const out: { gte?: Date; lt?: Date } = {}
  if (range.from) {
    const noon = parseJakartaDateIso(range.from)
    out.gte = new Date(noon.getTime() - 12 * 3600 * 1000)
  }
  if (range.to) {
    const noon = parseJakartaDateIso(range.to)
    out.lt = new Date(noon.getTime() + 12 * 3600 * 1000)
  }
  return out
}

/** Baca `dateRange`/`dateFrom`/`dateTo` dari query string jadi filter Prisma siap pakai. */
export function dateRangeFilterFromParams(sp: URLSearchParams): { gte?: Date; lt?: Date } | null {
  const preset = (sp.get("dateRange") ?? "all") as DateRangePreset
  const range = resolveDateRangePreset(preset, { from: sp.get("dateFrom"), to: sp.get("dateTo") })
  if (!range) return null
  const instants = jakartaDateRangeToInstants(range)
  return instants.gte || instants.lt ? instants : null
}
