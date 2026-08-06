import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola master data" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  for (const key of ["name", "ipAddress", "vendorId", "cloudTypeId", "core", "ram", "storage", "dnsServer1", "dnsServer2", "periodId"]) {
    if (typeof body[key] === "string") data[key] = body[key] || null
  }
  if (typeof body.periodCount === "number") data.periodCount = body.periodCount
  if (typeof body.price === "number") data.price = body.price
  if (typeof body.active === "boolean") data.active = body.active
  if (typeof body.lastPaidAt === "string") data.lastPaidAt = body.lastPaidAt ? new Date(body.lastPaidAt) : null

  const server = await prisma.server.update({ where: { id }, data })
  return NextResponse.json(server)
}
