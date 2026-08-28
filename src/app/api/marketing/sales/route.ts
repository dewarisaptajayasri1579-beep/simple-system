import { NextResponse } from "next/server"

import { hashPassword } from "@/lib/auth"
import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/marketing/sales — Manager/Owner membuat akun anggota Marketing langsung dari modul
 * Marketing. Akun dibuat dengan `modules: ["marketing"]` SAJA (tidak diberi akses Internal) dan
 * `role: "admin"` (role akun ini tidak berpengaruh apa-apa selama tidak punya modul internal).
 * Opsional langsung dimasukkan ke satu tim dengan peran tertentu.
 *
 * body: { name, email, password, phoneNumber?, teamId?, membershipRole?: "SALES"|"SPV"|"MEMBER",
 *         supervisorUserId? }
 */
export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager / Owner yang bisa menambah anggota." }, { status: 403 })
  }

  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const name = typeof b?.name === "string" ? b.name.trim() : ""
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : ""
  const password = typeof b?.password === "string" ? b.password : ""
  const phoneNumber = typeof b?.phoneNumber === "string" && b.phoneNumber.trim() ? b.phoneNumber.trim() : null
  const teamId = typeof b?.teamId === "string" && b.teamId ? b.teamId : null
  const membershipRole = ["SALES", "SPV", "MEMBER"].includes(String(b?.membershipRole)) ? String(b?.membershipRole) : "SALES"
  const supervisorUserId = typeof b?.supervisorUserId === "string" && b.supervisorUserId ? b.supervisorUserId : null

  if (!name || !email || !password) return NextResponse.json({ error: "Nama, email, dan password wajib diisi" }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 })
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 })
  }
  if (teamId && !(await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Tim tidak ditemukan" }, { status: 400 })
  }

  const created = await prisma.user.create({
    data: { name, email, phoneNumber, role: "admin", modules: ["marketing"], passwordHash: hashPassword(password) },
    select: { id: true, name: true, email: true },
  })

  let membershipId: string | null = null
  if (teamId) {
    const m = await prisma.teamMembership.create({
      data: { teamId, userId: created.id, membershipRole, supervisorUserId },
      select: { id: true },
    })
    membershipId = m.id
  }

  await logAudit({
    actorUserId: user.id,
    action: "marketing.sales.create",
    entityType: "user",
    entityId: created.id,
    after: { email, teamId, membershipRole },
  })

  return NextResponse.json({ user: created, membershipId }, { status: 201 })
}
