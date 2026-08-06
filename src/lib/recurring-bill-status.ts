/** Konversi nama periode ("Bulanan", "3 Bulanan", "Tahunan", "2 Tahunan", dst) jadi jumlah bulan. */
export function periodNameToMonths(name: string): number {
  const lower = name.toLowerCase().trim()
  const match = /^(\d+)\s*(bulanan|tahunan)$/.exec(lower)
  if (match) {
    const n = Number(match[1])
    return match[2] === "tahunan" ? n * 12 : n
  }
  if (lower === "bulanan") return 1
  if (lower === "tahunan") return 12
  return 1
}

export function computeNextDueDate(
  lastPaidAt: Date | null,
  periodName: string | undefined,
  periodCount: number | null | undefined
): Date | null {
  if (!lastPaidAt) return null
  const months = (periodName ? periodNameToMonths(periodName) : 1) * (periodCount && periodCount > 0 ? periodCount : 1)
  const next = new Date(lastPaidAt)
  next.setMonth(next.getMonth() + months)
  return next
}

export type DueBucket = "overdue" | "due_soon" | "ok"

export function getDueBucket(nextDueDate: Date | null, reminderDaysBefore: number, reference: Date = new Date()): DueBucket {
  if (!nextDueDate) return "ok"
  if (nextDueDate.getTime() < reference.getTime()) return "overdue"
  const reminderThreshold = new Date(nextDueDate)
  reminderThreshold.setDate(reminderThreshold.getDate() - reminderDaysBefore)
  if (reference.getTime() >= reminderThreshold.getTime()) return "due_soon"
  return "ok"
}
