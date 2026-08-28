import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { getMarketingSetting } from "@/lib/marketing/settings"
import { prisma } from "@/lib/prisma"

const VALID = ["COLD", "WARM", "HOT"]

/** POST /api/marketing/leads/[id]/temperature — ubah temperatur manual (PIC/SPV/Manager).
 *  Tulis LeadTemperatureHistory + set manual-override lock (docs/06 §6) + recalc priority. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as { temperature?: unknown; reason?: unknown } | null
  const temperature = typeof body?.temperature === "string" ? body.temperature.toUpperCase() : ""
  const reason = typeof body?.reason === "string" ? body.reason.trim() || null : null
  if (!VALID.includes(temperature)) {
    return NextResponse.json({ error: "Temperatur harus COLD, WARM, atau HOT" }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({ where: { id }, select: { temperature: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  if (!(await canActOnLead(user, id))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  if (lead.temperature === temperature) return NextResponse.json({ ok: true, unchanged: true })

  const lockHours = await getMarketingSetting("temperature.override_lock_hours")
  const lockedUntil = new Date(Date.now() + lockHours * 3600000)

  await prisma.$transaction([
    prisma.lead.update({
      where: { id },
      data: { temperature, temperatureSource: "MANUAL", temperatureLockedUntil: lockedUntil },
    }),
    prisma.leadTemperatureHistory.create({
      data: {
        leadId: id,
        fromTemperature: lead.temperature,
        toTemperature: temperature,
        source: "MANUAL",
        reason,
        changedByUserId: user.id,
      },
    }),
  ])

  await recalcLeadDerived(id).catch(() => {})
  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.temperature",
    entityType: "lead",
    entityId: id,
    before: { temperature: lead.temperature },
    after: { temperature },
    metadata: reason ? { reason } : undefined,
  })

  return NextResponse.json({ ok: true, temperature })
}
