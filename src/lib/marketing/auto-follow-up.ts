import { getMarketingSetting } from "@/lib/marketing/settings"
import { prisma } from "@/lib/prisma"

/**
 * Jadwalkan Follow Up otomatis untuk `leadId` — dipanggil dari 4 titik: lead baru masuk, pesan
 * customer masuk, aktivitas dicatat, dan follow up diselesaikan tanpa "jadwal berikutnya".
 *
 * Guard (semua harus lolos, kalau tidak → return null):
 *  - `follow_up.auto_schedule` = 1 (default ON)
 *  - lead `outcome` masih OPEN
 *  - lead BELUM punya follow up berstatus OPEN (anti-numpuk)
 *  - ada offset jam valid: `Segment.defaultFollowUpHours` → fallback `follow_up.default_hours`
 *  - ada user yang bisa ditugasi (PIC aktif → fallback `createdByUserId`)
 *
 * `scheduledAt` = `from` (default sekarang) + offset jam. Aman dipanggil berkali-kali.
 */
export async function ensureAutoFollowUp(
  leadId: string,
  opts: { from?: Date; purpose: string; reason: string; createdByUserId?: string | null },
): Promise<string | null> {
  if ((await getMarketingSetting("follow_up.auto_schedule")) < 1) return null

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      outcome: true,
      segment: { select: { defaultFollowUpHours: true } },
      followUps: { where: { status: "OPEN" }, select: { id: true }, take: 1 },
      assignments: { where: { isActive: true }, select: { assignedUserId: true }, take: 1 },
    },
  })
  if (!lead || lead.outcome !== "OPEN" || lead.followUps.length > 0) return null

  const hours = lead.segment?.defaultFollowUpHours ?? (await getMarketingSetting("follow_up.default_hours"))
  if (!hours || hours <= 0) return null

  const assignedUserId = lead.assignments[0]?.assignedUserId ?? opts.createdByUserId ?? null
  if (!assignedUserId) return null

  const scheduledAt = new Date((opts.from ?? new Date()).getTime() + hours * 3_600_000)

  const fu = await prisma.leadFollowUp
    .create({
      data: {
        leadId,
        assignedUserId,
        createdByUserId: opts.createdByUserId ?? assignedUserId,
        scheduledAt,
        purpose: opts.purpose,
        note: `Dijadwalkan otomatis — ${opts.reason}`,
        status: "OPEN",
        source: "AUTO",
      },
      select: { id: true },
    })
    .catch(() => null)
  return fu?.id ?? null
}
