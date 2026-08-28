import { prisma } from "@/lib/prisma"
import { startOfToday } from "@/lib/marketing/follow-up"

/**
 * Reminder follow up lead → bikin baris `LeadNotification` untuk PIC (assignedUser) tiap follow up
 * OPEN yang sudah/hampir jatuh tempo. Dedupe lewat `dedupeKey` unik per (followUp, kind, tanggal),
 * jadi overdue nge-remind sekali per hari, bukan tiap jam.
 *
 * Pengiriman nyata (push / WA) menyusul di Fase 9 (Notification Center + Web Push) — untuk sekarang
 * baris notifikasi cukup tersimpan + `LeadFollowUp.reminderSentAt` ditandai.
 */
const DUE_SOON_MS = 3 * 60 * 60 * 1000

export async function runMarketingFollowupReminders() {
  const now = new Date()
  const sot = startOfToday(now)
  const horizon = new Date(now.getTime() + DUE_SOON_MS)
  const dateTag = sot.toISOString().slice(0, 10)

  const followUps = await prisma.leadFollowUp.findMany({
    where: { status: "OPEN", scheduledAt: { lte: horizon } },
    select: {
      id: true,
      leadId: true,
      scheduledAt: true,
      purpose: true,
      assignedUserId: true,
      lead: { select: { displayName: true } },
    },
  })
  if (followUps.length === 0) return { created: 0, scanned: 0 }

  const rows = followUps.map((f) => {
    const kind = f.scheduledAt < sot ? "OVERDUE" : f.scheduledAt <= now ? "DUE" : "DUE_SOON"
    const label =
      kind === "OVERDUE" ? "terlambat" : kind === "DUE" ? "jatuh tempo hari ini" : "sebentar lagi jatuh tempo"
    return {
      userId: f.assignedUserId,
      type: `FOLLOW_UP_${kind}`,
      title: `Follow up ${label}: ${f.lead.displayName}`,
      body: f.purpose,
      entityType: "lead_follow_up",
      entityId: f.id,
      deepLink: `/marketing/leads/${f.leadId}`,
      dedupeKey: `followup:${f.id}:${kind}:${dateTag}`,
      status: "PENDING",
    }
  })

  const result = await prisma.leadNotification.createMany({ data: rows, skipDuplicates: true })

  if (result.count > 0) {
    await prisma.leadFollowUp.updateMany({
      where: { id: { in: followUps.map((f) => f.id) }, reminderSentAt: null },
      data: { reminderSentAt: now },
    })
  }

  return { created: result.count, scanned: followUps.length }
}
