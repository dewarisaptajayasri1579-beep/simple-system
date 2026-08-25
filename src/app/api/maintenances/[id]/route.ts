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
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
  if (typeof body.clientId === "string" && body.clientId) data.clientId = body.clientId
  if (typeof body.periodId === "string") data.periodId = body.periodId || null
  if (typeof body.periodCount === "number") data.periodCount = body.periodCount
  if (typeof body.price === "number") data.price = body.price
  if (typeof body.active === "boolean") data.active = body.active
  if (typeof body.lastPaidAt === "string") data.lastPaidAt = body.lastPaidAt ? new Date(body.lastPaidAt) : null
  if (typeof body.subscriptionStart === "string") data.subscriptionStart = body.subscriptionStart ? new Date(body.subscriptionStart) : null

  try {
    const maintenance = await prisma.maintenance.update({ where: { id }, data, include: { client: true, period: true } })
    return NextResponse.json(maintenance)
  } catch (err) {
    console.error("[PATCH /api/maintenances/:id]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan maintenance" }, { status: 500 })
  }
}
