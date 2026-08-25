import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "admin") return NextResponse.json({ error: "Cuma Owner/Admin yang bisa kelola master data" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  for (const key of ["name", "clientId", "cpanelAccountId"]) {
    if (typeof body[key] === "string") data[key] = body[key] || null
  }
  if (typeof body.sellPrice === "number") data.sellPrice = body.sellPrice
  if (typeof body.active === "boolean") data.active = body.active
  if (typeof body.lastPaidAt === "string") data.lastPaidAt = body.lastPaidAt ? new Date(body.lastPaidAt) : null
  if (typeof body.expiryDate === "string") data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null

  const domain = await prisma.domain.update({
    where: { id },
    data,
    include: { client: true },
  })
  return NextResponse.json(domain)
}
