import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { logAudit } from "@/lib/marketing/audit"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { prisma } from "@/lib/prisma"

/** GET — semua sumber lead. POST — buat baru (MANAGER/owner). */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const [rows, role] = await Promise.all([
    prisma.leadSource.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    resolveMarketingRole(user.id, user.role),
  ])
  return NextResponse.json({ sources: rows, canEdit: role === "MANAGER" })
}

export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  if ((await resolveMarketingRole(user.id, user.role)) !== "MANAGER") {
    return NextResponse.json({ error: "Hanya Manager/Owner yang bisa kelola master data." }, { status: 403 })
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown; name?: unknown } | null
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_") : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!code || !name) return NextResponse.json({ error: "Kode & nama wajib" }, { status: 400 })
  if (await prisma.leadSource.findUnique({ where: { code } })) {
    return NextResponse.json({ error: `Kode "${code}" sudah dipakai` }, { status: 400 })
  }
  const r = await prisma.leadSource.create({ data: { code, name } })
  await logAudit({ actorUserId: user.id, action: "marketing.source.create", entityType: "lead_source", entityId: r.id, after: { code, name } })
  return NextResponse.json({ source: { id: r.id } }, { status: 201 })
}
