/** Jarak antar 2 koordinat GPS (meter) — dipakai validasi geofence absen masuk/pulang.
 *  Radius bumi ~6.371km, formula haversine standar. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** "HH:mm" (HrSettings.jamMasuk/jamPulang) + tanggal absen -> Date lengkap, dipakai
 *  bandingkan terhadap checkInAt/checkOutAt aktual untuk hitung telat/pulang cepat. */
export function timeOnDate(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10))
  const result = new Date(date)
  result.setHours(h || 0, m || 0, 0, 0)
  return result
}
