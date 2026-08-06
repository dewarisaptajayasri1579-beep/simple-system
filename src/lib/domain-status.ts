import { jakartaTodayDateIso } from "@/lib/datetime"

export type ExpiryBucket = "expired" | "expiring_this_month" | "expiring_next_month" | "safe"

/** Domain/subdomain lama tidak punya field expiry eksplisit — dihitung dari tanggal bayar
 *  terakhir + 1 tahun (siklus renewal tahunan standar registrar domain). */
export function computeDomainExpiryDate(lastPaidAt: Date | null): Date | null {
  if (!lastPaidAt) return null
  const expiry = new Date(lastPaidAt)
  expiry.setFullYear(expiry.getFullYear() + 1)
  return expiry
}

export function getExpiryBucket(expiryDate: Date | null, reference: Date = new Date()): ExpiryBucket {
  if (!expiryDate) return "safe"

  const todayIso = jakartaTodayDateIso(reference)
  const [ty, tm] = todayIso.split("-").map(Number)

  if (expiryDate.getTime() < reference.getTime()) return "expired"

  const expiryYear = expiryDate.getFullYear()
  const expiryMonth = expiryDate.getMonth() + 1

  if (expiryYear === ty && expiryMonth === tm) return "expiring_this_month"

  const nextMonthDate = new Date(Date.UTC(ty, tm, 1)) // tm sudah 1-indexed -> ini bulan depan
  if (expiryYear === nextMonthDate.getUTCFullYear() && expiryMonth === nextMonthDate.getUTCMonth() + 1) {
    return "expiring_next_month"
  }

  return "safe"
}
