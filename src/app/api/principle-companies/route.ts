import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Perusahaan bermodel tagihan per-principle (Blesscom & Blessfull) — lihat menu Blesscom. */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const companies = await prisma.principleCompany.findMany({
    orderBy: { name: "asc" },
    include: {
      client: { select: { id: true, name: true } },
      priceTiers: { orderBy: { fromCount: "asc" } },
      _count: { select: { principles: true } },
    },
  })
  return NextResponse.json(companies)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "admin", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa kelola perusahaan" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { name?: string; clientId?: string; notes?: string } | null
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: "Nama perusahaan wajib diisi" }, { status: 400 })

  const company = await prisma.principleCompany.create({
    data: { name, clientId: body?.clientId || null, notes: body?.notes?.trim() || null },
    include: { client: { select: { id: true, name: true } }, priceTiers: true, _count: { select: { principles: true } } },
  })
  return NextResponse.json(company, { status: 201 })
}
