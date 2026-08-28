import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canActOnLead } from "@/lib/marketing/permissions"
import { recalcLeadDerived } from "@/lib/marketing/recalc"
import { prisma } from "@/lib/prisma"

const VALID = ["OPEN", "WON", "LOST"]

/**
 * POST /api/marketing/leads/[id]/outcome — set OPEN/WON/LOST (PIC/SPV/Manager). docs/06 §25-§27.
 *  WON  → wonAt (+ opsional `wonAt` tanggal, `dealValue` Rp, `wonNote`); tutup follow up OPEN.
 *  LOST → wajib `lostReasonId`, lostAt; tutup follow up OPEN.
 *  OPEN dari WON/LOST = Buka Kembali: bersihkan won/lost, recompute temperatur.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { outcome?: unknown; lostReasonId?: unknown; dealValue?: unknown; wonNote?: unknown; wonAt?: unknown }
    | null
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
  const wonAt =
    outcome === "WON" && typeof body?.wonAt === "string" && !Number.isNaN(new Date(body.wonAt).getTime())
      ? new Date(body.wonAt)
      : now
  const dealValue =
    outcome === "WON" && body?.dealValue != null && Number.isFinite(Number(body.dealValue))
      ? Math.round(Number(body.dealValue))
      : null
  const wonNote = outcome === "WON" && typeof body?.wonNote === "string" ? body.wonNote.trim() || null : null

  const data =
    outcome === "WON"
      ? { outcome, wonAt, dealValue, wonNote, lostAt: null, lostReasonId: null }
      : outcome === "LOST"
        ? { outcome, lostAt: now, lostReasonId, wonAt: null, dealValue: null, wonNote: null }
        : { outcome, wonAt: null, lostAt: null, lostReasonId: null, dealValue: null, wonNote: null }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data })
    // §25/§26 — tutup follow up OPEN saat WON/LOST
    if (outcome === "WON" || outcome === "LOST") {
      await tx.leadFollowUp.updateMany({
        where: { leadId: id, status: "OPEN" },
        data: { status: "CANCELLED", cancelledAt: now, resultNote: `Auto: lead ${outcome}` },
      })
    }
  })

  await recalcLeadDerived(id).catch(() => {})
  const isReopen = lead.outcome !== "OPEN" && outcome === "OPEN"
  await logAudit({
    actorUserId: user.id,
    action: isReopen ? "marketing.lead.reopen" : "marketing.lead.outcome",
    entityType: "lead",
    entityId: id,
    before: { outcome: lead.outcome },
    after: { outcome, lostReasonId: outcome === "LOST" ? lostReasonId : null, dealValue },
  })

  return NextResponse.json({ ok: true, outcome })
}
