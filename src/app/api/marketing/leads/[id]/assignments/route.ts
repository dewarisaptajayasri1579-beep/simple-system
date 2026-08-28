import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { canViewMarketing, resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/marketing/leads/[id]/assignments — pindah PIC lead.
 *  body: { action: "takeover" | "reassign", assignedUserId?, reason? }
 *   - takeover  : caller jadi PIC (siapa pun anggota tim boleh — ini tombol "Ambil Alih").
 *   - reassign  : set PIC ke `assignedUserId` — hanya MANAGER/SPV, atau PIC aktif saat ini
 *                 (hand-off). Wajib `reason`.
 * Tutup assignment lama (isActive=false, endedAt), buat yang baru, kirim LeadNotification ke PIC baru.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id }, select: { id: true, displayName: true } })
  if (!lead) return NextResponse.json({ error: "Lead tidak ditemukan" }, { status: 404 })

  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; assignedUserId?: unknown; reason?: unknown }
    | null
  const action = body?.action === "reassign" ? "reassign" : "takeover"
  const reason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  const [role, activeAssignment] = await Promise.all([
    resolveMarketingRole(user.id, user.role),
    prisma.leadAssignment.findFirst({ where: { leadId: id, isActive: true }, select: { id: true, assignedUserId: true } }),
  ])
  const isCurrentPic = activeAssignment?.assignedUserId === user.id

  let targetUserId: string
  if (action === "takeover") {
    targetUserId = user.id
  } else {
    if (role !== "MANAGER" && role !== "SPV" && !isCurrentPic) {
      return NextResponse.json({ error: "Hanya SPV/Manager atau PIC saat ini yang bisa reassign." }, { status: 403 })
    }
    targetUserId = typeof body?.assignedUserId === "string" ? body.assignedUserId : ""
    if (!targetUserId) return NextResponse.json({ error: "Pilih user tujuan dulu." }, { status: 400 })
    if (!reason) return NextResponse.json({ error: "Alasan reassign wajib diisi." }, { status: 400 })
  }

  if (activeAssignment?.assignedUserId === targetUserId) {
    return NextResponse.json({ error: "User itu sudah jadi PIC lead ini." }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, modules: true, name: true } })
  if (!targetUser || !canViewMarketing(targetUser)) {
    return NextResponse.json({ error: "User tujuan tidak punya akses modul Marketing." }, { status: 400 })
  }

  const assignment = await prisma.$transaction(async (tx) => {
    await tx.leadAssignment.updateMany({
      where: { leadId: id, isActive: true },
      data: { isActive: false, endedAt: new Date() },
    })
    const created = await tx.leadAssignment.create({
      data: {
        leadId: id,
        assignedUserId: targetUserId,
        assignedByUserId: user.id,
        assignmentType: action === "takeover" ? "TAKEOVER" : "PRIMARY",
        reason: reason ?? (action === "takeover" ? "Ambil alih" : null),
        isActive: true,
      },
    })
    await tx.leadNotification.create({
      data: {
        userId: targetUserId,
        type: "LEAD_ASSIGNED",
        title: `Kamu jadi PIC lead: ${lead.displayName}`,
        body: action === "takeover" ? `${user.name} mengambil alih & menyerahkan ke kamu` : reason || "Di-assign oleh SPV/Manager",
        entityType: "lead",
        entityId: id,
        deepLink: `/marketing/leads/${id}`,
        dedupeKey: `assign:${created.id}`,
        status: "PENDING",
      },
    })
    return created
  })

  await logAudit({
    actorUserId: user.id,
    action: `marketing.assignment.${action}`,
    entityType: "lead",
    entityId: id,
    before: { previousPicUserId: activeAssignment?.assignedUserId ?? null },
    after: { assignmentId: assignment.id, assignedUserId: targetUserId },
    metadata: reason ? { reason } : undefined,
  })

  return NextResponse.json({ assignment: { id: assignment.id, assignedUserId: targetUserId } }, { status: 201 })
}
