import { jakartaTodayDateIso } from "@/lib/datetime"

export interface ReportPeriod {
  from: Date
  to: Date
  fromIso: string
  toIso: string
}

/** Default periode = bulan berjalan (Jakarta), bisa dioverride lewat query param ?from=&to=. */
export function resolveReportPeriod(params: { from?: string; to?: string }): ReportPeriod {
  const todayIso = jakartaTodayDateIso()
  const [y, m] = todayIso.split("-").map(Number)

  const defaultFromIso = `${y}-${String(m).padStart(2, "0")}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const defaultToIso = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

  const fromIso = params.from || defaultFromIso
  const toIso = params.to || defaultToIso

  return {
    from: new Date(`${fromIso}T00:00:00+07:00`),
    to: new Date(`${toIso}T23:59:59+07:00`),
    fromIso,
    toIso,
  }
}
