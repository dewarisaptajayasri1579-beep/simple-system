import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — daftar tim + member. POST — buat tim (MANAGER/owner). */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const [teams, role] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        managerUser: { select: { id: true, name: true } },
        memberships: {
          where: { activeUntil: null },
          select: {
            id: true,
            membershipRole: true,
            user: { select: { id: true, name: true } },
            supervisorUser: { select: { id: true, name: true } },
          },
        },
      },
    }),
    resolveMarketingRole(user.id, user.role),
  ])
  return NextResponse.json({ teams, canEdit: role === "MANAGER" })
}

export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola tim." }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { name?: unknown; code?: unknown; managerUserId?: unknown } | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : ""
  if (!name || !code) return NextResponse.json({ error: "Nama & kode tim wajib diisi" }, { status: 400 })
  if (await prisma.team.findUnique({ where: { code } })) {
    return NextResponse.json({ error: "Kode tim sudah dipakai" }, { status: 400 })
  }

  const team = await prisma.team.create({
    data: { name, code, managerUserId: typeof body?.managerUserId === "string" ? body.managerUserId : null },
  })
  await logAudit({ actorUserId: user.id, action: "marketing.team.create", entityType: "team", entityId: team.id, after: { name, code } })
  return NextResponse.json({ team: { id: team.id } }, { status: 201 })
}
