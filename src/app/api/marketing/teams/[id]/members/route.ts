import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

const ROLES = ["SALES", "SPV", "MEMBER"]

/** POST — tambah member ke tim. DELETE ?membershipId= — akhiri keanggotaan (soft, set activeUntil).
 *  MANAGER/owner only. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola tim." }, { status: 403 })
  }

  const { id: teamId } = await params
  const body = (await request.json().catch(() => null)) as
    | { userId?: unknown; membershipRole?: unknown; supervisorUserId?: unknown }
    | null
  const userId = typeof body?.userId === "string" ? body.userId : ""
  const membershipRole = ROLES.includes(String(body?.membershipRole)) ? String(body!.membershipRole) : "SALES"
  if (!userId) return NextResponse.json({ error: "Pilih user dulu" }, { status: 400 })

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } })
  if (!team) return NextResponse.json({ error: "Tim tidak ditemukan" }, { status: 404 })

  const existing = await prisma.teamMembership.findFirst({ where: { teamId, userId, activeUntil: null }, select: { id: true } })
  if (existing) return NextResponse.json({ error: "User sudah jadi anggota tim ini" }, { status: 400 })

  const membership = await prisma.teamMembership.create({
    data: {
      teamId,
      userId,
      membershipRole,
      supervisorUserId: typeof body?.supervisorUserId === "string" && body.supervisorUserId ? body.supervisorUserId : null,
    },
  })
  await logAudit({
    actorUserId: user.id,
    action: "marketing.team.member.add",
    entityType: "team",
    entityId: teamId,
    after: { membershipId: membership.id, userId, membershipRole },
  })
  return NextResponse.json({ membership: { id: membership.id } }, { status: 201 })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola tim." }, { status: 403 })
  }

  const { id: teamId } = await params
  const membershipId = new URL(request.url).searchParams.get("membershipId")
  if (!membershipId) return NextResponse.json({ error: "membershipId wajib" }, { status: 400 })

  await prisma.teamMembership.updateMany({
    where: { id: membershipId, teamId, activeUntil: null },
    data: { activeUntil: new Date() },
  })
  await logAudit({ actorUserId: user.id, action: "marketing.team.member.remove", entityType: "team", entityId: teamId, after: { membershipId } })
  return NextResponse.json({ ok: true })
}
