/**
 * Smoke test wiring modul Marketing — bikin 1 lead throwaway, jalankan alur inti (assign →
 * aktivitas → follow up → selesai → priority → notifikasi), cetak hasil, lalu HAPUS lagi.
 * TIDAK memanggil AI (butuh API key + jaringan). Aman di DB dev.
 *
 * Jalankan: npx tsx --env-file=.env scripts/marketing-smoke.ts
 */
import { prisma } from "../src/lib/prisma"
import { recalcLeadPriority } from "../src/lib/marketing/priority"
import { createNotification } from "../src/lib/marketing/notify"
import { buildTeamAggregates } from "../src/lib/marketing/analytics"
import { getAllMarketingSettings } from "../src/lib/marketing/settings"

async function main() {
  const user = await prisma.user.findFirst({
    where: { OR: [{ role: "owner" }, { modules: { has: "marketing" } }] },
    select: { id: true, name: true },
  })
  if (!user) throw new Error("Butuh minimal 1 user (owner / modules marketing). Batal.")
  console.log(`Actor: ${user.name}`)

  const activityType = await prisma.leadActivityType.findUnique({ where: { code: "DISCUSSION" } })
  const resultType = await prisma.leadFollowUpResultType.findUnique({ where: { code: "INTERESTED" } })
  if (!activityType || !resultType) throw new Error("seed-marketing.ts belum dijalankan. Batal.")

  const lead = await prisma.lead.create({
    data: { displayName: "[SMOKE] Test Lead", whatsappNumber: "620000000000", temperature: "WARM" },
  })
  console.log(`Lead dibuat: ${lead.id}`)

  try {
    await prisma.leadAssignment.create({
      data: { leadId: lead.id, assignedUserId: user.id, assignmentType: "PRIMARY" },
    })

    await prisma.leadActivity.create({
      data: { leadId: lead.id, activityTypeId: activityType.id, actorUserId: user.id, occurredAt: new Date(), source: "MANUAL" },
    })
    await prisma.lead.update({ where: { id: lead.id }, data: { currentActivityStage: "DISCUSSION", lastInteractionAt: new Date() } })

    const fu = await prisma.leadFollowUp.create({
      data: {
        leadId: lead.id,
        assignedUserId: user.id,
        createdByUserId: user.id,
        scheduledAt: new Date(Date.now() - 3600_000),
        purpose: "smoke test",
        status: "OPEN",
      },
    })
    await prisma.leadFollowUp.update({
      where: { id: fu.id },
      data: { status: "COMPLETED", resultTypeId: resultType.id, completedAt: new Date(), isOnTime: false },
    })

    const prio = await recalcLeadPriority(lead.id)
    console.log(`Priority: ${prio?.score} (${prio?.level}) — ${prio?.reasons.join(", ")}`)

    const notif = await createNotification({
      userId: user.id,
      type: "SMOKE",
      title: "[SMOKE] notif",
      body: "test",
      dedupeKey: `smoke:${lead.id}`,
    })
    console.log(`Notifikasi dibuat: ${notif}`)

    const team = await buildTeamAggregates()
    console.log(`Agregat tim: ${team.length} anggota`)
    console.log(`Settings: ${JSON.stringify(await getAllMarketingSettings())}`)

    console.log("\nSMOKE OK ✅")
  } finally {
    await prisma.leadNotification.deleteMany({ where: { dedupeKey: `smoke:${lead.id}` } })
    await prisma.lead.delete({ where: { id: lead.id } })
    console.log("Lead throwaway dihapus.")
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
