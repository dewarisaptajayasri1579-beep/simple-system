import { getMarketingSetting } from "@/lib/marketing/settings"

/**
 * Working hours (docs/06 §20, §33) — timezone organisasi = Asia/Jakarta (WIB, UTC+7).
 * Minggu selalu libur; Senin-Jumat selalu kerja; Sabtu = toggle. Kalau `working_hours.enabled`
 * = 0 → pakai elapsed clock time (24/7).
 */
const WIB_OFFSET_MS = 7 * 3600 * 1000

export async function getWorkingHoursConfig() {
  const [enabled, startHour, endHour, saturday] = await Promise.all([
    getMarketingSetting("working_hours.enabled"),
    getMarketingSetting("working_hours.start_hour"),
    getMarketingSetting("working_hours.end_hour"),
    getMarketingSetting("working_hours.saturday"),
  ])
  return { enabled: enabled >= 1, startHour, endHour, saturday: saturday >= 1 }
}

/** Komponen tanggal/jam dalam WIB untuk sebuah timestamp UTC. */
function wibParts(d: Date) {
  const w = new Date(d.getTime() + WIB_OFFSET_MS)
  return { dow: w.getUTCDay(), hour: w.getUTCHours(), min: w.getUTCMinutes(), sec: w.getUTCSeconds() }
}

/** True kalau `at` (default sekarang) jatuh di dalam jam kerja. Working hours nonaktif → selalu true. */
export async function isWithinWorkingHours(at: Date = new Date()): Promise<boolean> {
  const cfg = await getWorkingHoursConfig()
  if (!cfg.enabled) return true
  const { dow, hour } = wibParts(at)
  const isWorkday = dow >= 1 && dow <= 5 ? true : dow === 6 ? cfg.saturday : false
  return isWorkday && hour >= cfg.startHour && hour < cfg.endHour
}

/**
 * Milidetik "jam kerja" antara `from` dan `to`. Kalau working hours nonaktif → selisih wall-clock.
 * Iterasi per menit (cukup akurat untuk response-time KPI, jendela biasanya < beberapa hari).
 */
export async function workingMsBetween(from: Date, to: Date): Promise<number> {
  if (to <= from) return 0
  const cfg = await getWorkingHoursConfig()
  if (!cfg.enabled) return to.getTime() - from.getTime()

  const isWorkday = (dow: number) => dow >= 1 && dow <= 5 ? true : dow === 6 ? cfg.saturday : false

  let ms = 0
  // langkah 60 dtk; batasi 45 hari supaya tidak runaway
  const stepMs = 60 * 1000
  const cap = from.getTime() + 45 * 86400 * 1000
  for (let t = from.getTime(); t < to.getTime() && t < cap; t += stepMs) {
    const { dow, hour } = wibParts(new Date(t))
    if (isWorkday(dow) && hour >= cfg.startHour && hour < cfg.endHour) ms += stepMs
  }
  return ms
}
