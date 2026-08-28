import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { prisma } from "@/lib/prisma"

const VALID = ["OPEN", "WON", "LOST"]

/** POST /api/marketing/leads/[id]/outcome — set OPEN/WON/LOST (PIC/SPV/Manager).
 *  WON → isi wonAt. LOST → wajib lostReasonId + isi lostAt. OPEN → bersihkan keduanya. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as { outcome?: unknown; lostReasonId?: unknown } | null
  const outcome = typeof body?.outcome === "string" ? body.outcome.toUpperCase() : ""
  const lostReasonId = typeof body?.lostReasonId === "string" ? body.lostReasonId : null
  if (!VALID.includes(outcome)) return NextResponse.json({ error: "Outcome harus OPEN, WON, atau LOST" }, { status: 400 })
  if (outcome === "LOST" && !lostReasonId) {
    return NextResponse.json({ error: "Pilih alasan LOST dulu." }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({ where: { id }, select: { outcome: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })
  if (!(await canActOnLead(user, id))) return NextResponse.json({ error: "Kamu bukan PIC lead ini." }, { status: 403 })

  const now = new Date()
  const data =
    outcome === "WON"
      ? { outcome, wonAt: now, lostAt: null, lostReasonId: null }
      : outcome === "LOST"
        ? { outcome, lostAt: now, lostReasonId, wonAt: null }
        : { outcome, wonAt: null, lostAt: null, lostReasonId: null }

  await prisma.lead.update({ where: { id }, data })
  await recalcLeadDerived(id).catch(() => {})
  await logAudit({
    actorUserId: user.id,
    action: "marketing.lead.outcome",
    entityType: "lead",
    entityId: id,
    before: { outcome: lead.outcome },
    after: { outcome, lostReasonId: outcome === "LOST" ? lostReasonId : null },
  })

  return NextResponse.json({ ok: true, outcome })
}
