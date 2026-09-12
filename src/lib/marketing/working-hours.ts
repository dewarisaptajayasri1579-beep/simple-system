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

export type WorkingHoursConfig = Awaited<ReturnType<typeof getWorkingHoursConfig>>

/**
 * Versi sinkron `workingMsBetween` yang confignya dioper dari luar — dipakai kalau harus
 * menghitung BANYAK pasangan sekaligus (mis. response time per lead di Laporan Daftar Lead):
 * ambil config sekali, lalu panggil ini berkali-kali tanpa query berulang.
 *
 * Iterasinya per HARI (maks 46 putaran), bukan per menit: untuk tiap hari kerja dihitung irisan
 * [from,to] dengan jendela jam kerja hari itu. Versi per-menit yang lama bisa sampai 64.800
 * putaran untuk satu pasang yang nggantung berhari-hari — tidak masalah buat 1 KPI agregat, tapi
 * langsung terasa kalau dipakai ratusan baris. Hasilnya juga lebih presisi (tidak dibulatkan ke
 * menit).
 */
export function workingMsBetweenSync(from: Date, to: Date, cfg: WorkingHoursConfig): number {
  if (to <= from) return 0
  if (!cfg.enabled) return to.getTime() - from.getTime()

  const isWorkday = (dow: number) => (dow >= 1 && dow <= 5 ? true : dow === 6 ? cfg.saturday : false)
  const DAY_MS = 86400 * 1000
  // Dibatasi 45 hari, sama dengan versi lama — pasangan yang lebih lama dari itu pasti anomali
  // data, jangan sampai bikin loop panjang.
  const end = Math.min(to.getTime(), from.getTime() + 45 * DAY_MS)

  // Kerja di "WIB epoch" (UTC + 7 jam) supaya batas hari & jam bisa dihitung pakai aritmetika
  // biasa, tanpa konversi timezone per iterasi.
  const fromWib = from.getTime() + WIB_OFFSET_MS
  const endWib = end + WIB_OFFSET_MS

  let ms = 0
  for (let dayStart = Math.floor(fromWib / DAY_MS) * DAY_MS; dayStart < endWib; dayStart += DAY_MS) {
    if (!isWorkday(new Date(dayStart).getUTCDay())) continue
    const windowStart = dayStart + cfg.startHour * 3600 * 1000
    const windowEnd = dayStart + cfg.endHour * 3600 * 1000
    const overlap = Math.min(endWib, windowEnd) - Math.max(fromWib, windowStart)
    if (overlap > 0) ms += overlap
  }
  return ms
}

/** Milidetik "jam kerja" antara `from` dan `to`. Kalau working hours nonaktif → selisih wall-clock. */
export async function workingMsBetween(from: Date, to: Date): Promise<number> {
  if (to <= from) return 0
  return workingMsBetweenSync(from, to, await getWorkingHoursConfig())
}
