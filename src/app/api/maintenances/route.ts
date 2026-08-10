import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get("clientId")

  const maintenances = await prisma.maintenance.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: true, period: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(maintenances)
}

interface MaintenanceInput {
  name: string
  clientId: string
  periodId?: string
  periodCount?: number
  price?: number
  lastPaidAt?: string
  subscriptionStart?: string
  active?: boolean
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola master data" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as MaintenanceInput | null
  if (!body?.name?.trim()) return NextResponse.json({ error: "Nama maintenance wajib diisi" }, { status: 400 })
  if (!body.clientId) return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 })

  const maintenance = await prisma.maintenance.create({
    data: {
      name: body.name.trim(),
      clientId: body.clientId,
      periodId: body.periodId || null,
      periodCount: body.periodCount || null,
      price: body.price ?? null,
      lastPaidAt: body.lastPaidAt ? new Date(body.lastPaidAt) : null,
      subscriptionStart: body.subscriptionStart ? new Date(body.subscriptionStart) : null,
      active: body.active ?? true,
    },
  })
  return NextResponse.json(maintenance, { status: 201 })
}
