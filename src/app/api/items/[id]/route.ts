import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (body.type === "jasa" || body.type === "barang") data.type = body.type
  if (typeof body.defaultPrice === "number") data.defaultPrice = body.defaultPrice
  if (typeof body.defaultCost === "number") data.defaultCost = body.defaultCost
  if (typeof body.unit === "string") data.unit = body.unit || null
  if (typeof body.active === "boolean") data.active = body.active

  const item = await prisma.item.update({ where: { id }, data })
  return NextResponse.json(item)
}
