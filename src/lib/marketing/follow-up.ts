/** Grace default sebelum sebuah follow up OPEN dihitung "overdue" (dipakai juga untuk isOnTime).
 *  Nanti bisa di-override lewat LeadSystemSetting (Fase 10). */
export const FOLLOW_UP_GRACE_MS = 2 * 60 * 60 * 1000

export function startOfToday(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfToday(d = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/** Bucket turunan dari status + scheduledAt (bukan kolom tersimpan). */
export function followUpBucket(status: string, scheduledAt: Date, now = new Date()): "today" | "upcoming" | "overdue" | "done" | "cancelled" {
  if (status === "COMPLETED") return "done"
  if (status === "CANCELLED") return "cancelled"
  if (scheduledAt < startOfToday(now)) return "overdue"
  if (scheduledAt <= endOfToday(now)) return "today"
  return "upcoming"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function followUpDto(f: any) {
  return {
    id: f.id,
    leadId: f.leadId,
    lead: f.lead ? { id: f.lead.id, displayName: f.lead.displayName, companyName: f.lead.companyName, temperature: f.lead.temperature } : null,
    scheduledAt: f.scheduledAt.toISOString(),
    purpose: f.purpose,
    note: f.note,
    status: f.status,
    resultType: f.resultType ?? null,
    resultNote: f.resultNote ?? null,
    completedAt: f.completedAt?.toISOString() ?? null,
    isOnTime: f.isOnTime ?? null,
    assignedUser: f.assignedUser ?? null,
    bucket: followUpBucket(f.status, f.scheduledAt),
  }
}
