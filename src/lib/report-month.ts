import { jakartaTodayDateIso } from "@/lib/datetime"

export interface ReportMonth {
  /** Awal bulan, 00:00:00 WIB. */
  from: Date
  /** Akhir bulan, 23:59:59 WIB. */
  to: Date
  /** "YYYY-MM" — nilai untuk <input type="month">. */
  monthIso: string
  /** Mis. "Oktober 2026". */
  label: string
}

/** Periode 1 BULAN (default bulan berjalan di Jakarta), dari query param `?bulan=YYYY-MM`.
 *  Dipisah dari resolveReportPeriod (yang rentang bebas from/to) karena laporan Uang Masuk
 *  filternya memang per bulan — satu input, tidak bisa salah pilih rentang. */
export function resolveReportMonth(params: { bulan?: string }): ReportMonth {
  const fallback = jakartaTodayDateIso().slice(0, 7)
  const monthIso = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.bulan ?? "") ? params.bulan! : fallback
  const [year, month] = monthIso.split("-").map(Number)

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const from = new Date(`${monthIso}-01T00:00:00+07:00`)
  const to = new Date(`${monthIso}-${String(lastDay).padStart(2, "0")}T23:59:59+07:00`)

  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  return { from, to, monthIso, label }
}
