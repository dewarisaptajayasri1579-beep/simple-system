import { createNotification } from "@/lib/marketing/notify"
import { getMarketingSetting } from "@/lib/marketing/settings"
import { startOfToday } from "@/lib/marketing/follow-up"
import { prisma } from "@/lib/prisma"

/**
 * Escalation ke SPV / Manager (docs/06 §18, §32). Dijalankan tiap jam bareng reminder follow up.
 * Sasaran: PIC + supervisor PIC (TeamMembership.supervisorUserId aktif) + manager tim PIC.
 * Dedupe harian lewat `dedupeKey`.
 */

/** userId penerima escalation untuk lead yang PIC-nya `picUserId` (termasuk PIC sendiri). */
async function recipientsFor(picUserId: string): Promise<string[]> {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId: picUserId, activeUntil: null },
    select: { supervisorUserId: true, team: { select: { managerUserId: true } } },
  })
  const set = new Set<string>([picUserId])
  for (const m of memberships) {
    if (m.supervisorUserId) set.add(m.supervisorUserId)
    if (m.team.managerUserId) set.add(m.team.managerUserId)
  }
  return [...set]
}

export async function runMarketingEscalations() {
  const now = new Date()
  const dateTag = startOfToday(now).toISOString().slice(0, 10)
  const [hotHours, fuHours, negDays] = await Promise.all([
    getMarketingSetting("escalation.hot_unreplied_hours"),
    getMarketingSetting("escalation.followup_overdue_hours"),
    getMarketingSetting("escalation.negotiation_idle_days"),
  ])

  let created = 0
  const emit = async (userIds: string[], n: Omit<Parameters<typeof createNotification>[0], "userId">) => {
    for (const uid of userIds) {
      if (await createNotification({ ...n, userId: uid })) created++
    }
  }

  // 1. Hot lead belum dibalas > SLA
  const hotCutoff = new Date(now.getTime() - hotHours * 3600000)
  const hotLeads = await prisma.lead.findMany({
    where: {
      outcome: "OPEN",
      temperature: "HOT",
      lastCustomerMessageAt: { lt: hotCutoff },
      OR: [{ lastSalesMessageAt: null }, { lastSalesMessageAt: { lt: prisma.lead.fields.lastCustomerMessageAt } }],
    },
    select: { id: true, displayName: true, assignments: { where: { isActive: true }, select: { assignedUserId: true } } },
    take: 100,
  })
  for (const l of hotLeads) {
    const pic = l.assignments[0]?.assignedUserId
    if (!pic) continue
    await emit(await recipientsFor(pic), {
      type: "ESCALATION_HOT_UNREPLIED",
      title: `Hot lead belum dibalas > ${hotHours} jam: ${l.displayName}`,
      body: "Perlu tindak lanjut / take over.",
      entityType: "lead",
      entityId: l.id,
      deepLink: `/marketing/leads/${l.id}`,
      dedupeKey: `esc:hotunreplied:${l.id}:${dateTag}`,
    })
  }

  // 2. Follow up overdue > threshold
  const fuCutoff = new Date(now.getTime() - fuHours * 3600000)
  const overdueFu = await prisma.leadFollowUp.findMany({
    where: { status: "OPEN", scheduledAt: { lt: fuCutoff } },
    select: { id: true, leadId: true, assignedUserId: true, purpose: true, lead: { select: { displayName: true } } },
    take: 150,
  })
  for (const f of overdueFu) {
    await emit(await recipientsFor(f.assignedUserId), {
      type: "ESCALATION_FOLLOWUP_OVERDUE",
      title: `Follow up overdue > ${fuHours} jam: ${f.lead.displayName}`,
      body: f.purpose,
      entityType: "lead_follow_up",
      entityId: f.id,
      deepLink: `/marketing/leads/${f.leadId}`,
      dedupeKey: `esc:fuoverdue:${f.id}:${dateTag}`,
    })
  }

  // 3. Negosiasi idle > SLA
  const negCutoff = new Date(now.getTime() - negDays * 86400000)
  const negLeads = await prisma.lead.findMany({
    where: { outcome: "OPEN", currentActivityStage: "NEGOTIATION", lastInteractionAt: { lt: negCutoff } },
    select: { id: true, displayName: true, assignments: { where: { isActive: true }, select: { assignedUserId: true } } },
    take: 100,
  })
  for (const l of negLeads) {
    const pic = l.assignments[0]?.assignedUserId
    if (!pic) continue
    await emit(await recipientsFor(pic), {
      type: "ESCALATION_NEGOTIATION_IDLE",
      title: `Negosiasi idle > ${negDays} hari: ${l.displayName}`,
      body: "Dorong ke closing atau evaluasi.",
      entityType: "lead",
      entityId: l.id,
      deepLink: `/marketing/leads/${l.id}`,
      dedupeKey: `esc:negidle:${l.id}:${dateTag}`,
    })
  }

  return { created, scanned: hotLeads.length + overdueFu.length + negLeads.length }
}
