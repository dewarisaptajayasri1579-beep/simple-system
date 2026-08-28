import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadPriority } from "@/lib/marketing/priority"
import { prisma } from "@/lib/prisma"

const VALID = ["COLD", "WARM", "HOT"]

/** POST /api/marketing/leads/[id]/temperature — ubah temperatur manual (PIC/SPV/Manager).
 *  Tulis LeadTemperatureHistory + trigger recalc priority (stub Fase 4). */
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

  await prisma.$transaction([
    prisma.lead.update({ where: { id }, data: { temperature, temperatureSource: "MANUAL" } }),
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

  await recalcLeadPriority(id)
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
