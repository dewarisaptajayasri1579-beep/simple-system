import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Daftar principle 1 perusahaan (Blesscom/Blessfull). `?companyId=` wajib. */
export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const companyId = new URL(request.url).searchParams.get("companyId")
  if (!companyId) return NextResponse.json({ error: "companyId wajib" }, { status: 400 })

  const principles = await prisma.principle.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
  return NextResponse.json(principles)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "admin", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa menambah principle" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { companyId?: string; name?: string; appUrl?: string; startedAt?: string }
    | null
  const companyId = body?.companyId
  const name = body?.name?.trim()
  if (!companyId) return NextResponse.json({ error: "Perusahaan wajib dipilih" }, { status: 400 })
  if (!name) return NextResponse.json({ error: "Nama principle wajib diisi" }, { status: 400 })

  // sortOrder = nomor urut tampilan, lanjut dari yang terakhir (daftar aslinya bernomor).
  const last = await prisma.principle.findFirst({
    where: { companyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  })

  const principle = await prisma.principle.create({
    data: {
      companyId,
      name,
      appUrl: body?.appUrl?.trim() || null,
      startedAt: body?.startedAt ? new Date(`${body.startedAt}T00:00:00+07:00`) : null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  })
  return NextResponse.json(principle, { status: 201 })
}
