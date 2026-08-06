import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const data: { name?: string; coaAccountId?: string | null } = {}

  if (body?.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 })
    data.name = name
  }
  if (body?.coaAccountId !== undefined) {
    data.coaAccountId = typeof body.coaAccountId === "string" && body.coaAccountId ? body.coaAccountId : null
  }

  const category = await prisma.category.update({
    where: { id },
    data,
    include: { coaAccount: true, _count: { select: { transactions: true } } },
  })
  return NextResponse.json(category)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const usage = await prisma.transaction.count({ where: { categoryId: id } })
  if (usage > 0) {
    return NextResponse.json({ error: `Kategori masih dipakai di ${usage} transaksi — gabung dulu ke kategori lain` }, { status: 400 })
  }

  await prisma.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
