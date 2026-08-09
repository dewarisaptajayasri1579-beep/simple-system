import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const kind = searchParams.get("kind")

  const categories = await prisma.category.findMany({
    where: kind ? { kind } : undefined,
    include: { coaAccount: true, _count: { select: { transactions: true } } },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(categories)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const kind = body?.kind === "expense" || body?.kind === "hpp" ? body.kind : "income"
  const coaAccountId = typeof body?.coaAccountId === "string" && body.coaAccountId ? body.coaAccountId : null
  if (!name) return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 })

  const existing = await prisma.category.findFirst({
    where: { kind, name: { equals: name, mode: "insensitive" } },
  })
  if (existing) {
    // Kalau baru sekarang di-mapping ke akun COA (sebelumnya kosong), ikut diisi supaya
    // tidak perlu bolak-balik ke halaman COA cuma buat mapping kategori yang sudah ada.
    if (coaAccountId && !existing.coaAccountId) {
      const updated = await prisma.category.update({ where: { id: existing.id }, data: { coaAccountId }, include: { coaAccount: true } })
      return NextResponse.json(updated, { status: 200 })
    }
    return NextResponse.json(existing, { status: 200 })
  }

  const category = await prisma.category.create({ data: { name, kind, coaAccountId }, include: { coaAccount: true } })
  return NextResponse.json(category, { status: 201 })
}
