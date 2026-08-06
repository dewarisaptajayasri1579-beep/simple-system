/** Rentang satu bulan kalender (Jakarta, +07:00) dari string "YYYY-MM". Dipakai buat filter
 *  bulan di halaman COA dan Buku Besar — beda dari resolveReportPeriod (yang defaultnya bulan
 *  berjalan tapi bisa custom from/to bebas), ini SELALU tepat satu bulan penuh. */
export function monthPeriod(monthIso: string): { from: Date; to: Date } {
  const [y, m] = monthIso.split("-").map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return {
    from: new Date(`${monthIso}-01T00:00:00+07:00`),
    to: new Date(`${monthIso}-${String(lastDay).padStart(2, "0")}T23:59:59+07:00`),
  }
}
