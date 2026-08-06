import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get("all") === "1"

  const items = await prisma.item.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(items)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama item wajib diisi" }, { status: 400 })

  const item = await prisma.item.create({
    data: {
      name,
      type: body?.type === "barang" ? "barang" : "jasa",
      defaultPrice: Number(body?.defaultPrice) || 0,
      defaultCost: Number(body?.defaultCost) || 0,
      unit: body?.unit || null,
    },
  })

  return NextResponse.json(item, { status: 201 })
}
