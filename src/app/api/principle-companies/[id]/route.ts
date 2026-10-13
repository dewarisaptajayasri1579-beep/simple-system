import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "admin", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa kelola perusahaan" }, { status: 403 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => null)) as
    | { name?: string; clientId?: string | null; notes?: string | null; active?: boolean }
    | null
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const company = await prisma.principleCompany.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.clientId !== undefined ? { clientId: body.clientId || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
    include: { client: { select: { id: true, name: true } }, priceTiers: { orderBy: { fromCount: "asc" } }, _count: { select: { principles: true } } },
  })
  return NextResponse.json(company)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menghapus perusahaan" }, { status: 403 })

  const { id } = await params
  // Invoice yang sudah pernah dibuat menahan penghapusan (PrincipleInvoice.companyId tanpa
  // cascade) — supaya lampiran invoice lama tidak kehilangan induknya.
  const billed = await prisma.principleInvoice.count({ where: { companyId: id } })
  if (billed > 0) {
    return NextResponse.json(
      { error: `Tidak bisa dihapus — sudah ada ${billed} invoice Over Principle untuk perusahaan ini.` },
      { status: 409 },
    )
  }
  await prisma.principleCompany.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
