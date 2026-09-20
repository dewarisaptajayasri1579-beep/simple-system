import { jakartaTodayDateIso } from "@/lib/datetime"

export interface ReportPeriod {
  from: Date
  to: Date
  fromIso: string
  toIso: string
}

/** Rentang maksimum yang diizinkan untuk laporan yang menarik seluruh baris lead dalam periode
 *  (Volume, Performa Sales) dan meng-agregasi di JS — bukan `groupBy` DB. Tanpa batas ini, user
 *  bisa pilih rentang bertahun-tahun dan bikin `findMany` menarik jutaan baris. */
const MAX_RANGE_DAYS = 366

/** Default periode = bulan berjalan (Jakarta), bisa dioverride lewat query param ?from=&to=.
 *  Rentang di-clamp ke maksimum `MAX_RANGE_DAYS` (dihitung mundur dari `to`) supaya laporan yang
 *  menarik seluruh baris lead dalam periode tidak bisa diminta tanpa batas. */
export function resolveReportPeriod(params: { from?: string; to?: string }): ReportPeriod {
  const todayIso = jakartaTodayDateIso()
  const [y, m] = todayIso.split("-").map(Number)

  const defaultFromIso = `${y}-${String(m).padStart(2, "0")}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const defaultToIso = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`

  const fromIso = params.from || defaultFromIso
  const toIso = params.to || defaultToIso

  const to = new Date(`${toIso}T23:59:59+07:00`)
  const requestedFrom = new Date(`${fromIso}T00:00:00+07:00`)
  const minFrom = new Date(to.getTime() - MAX_RANGE_DAYS * 86400000)
  const from = requestedFrom < minFrom ? minFrom : requestedFrom

  return {
    from,
    to,
    fromIso: from === minFrom ? minFrom.toISOString().slice(0, 10) : fromIso,
    toIso,
  }
}
