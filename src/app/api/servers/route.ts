import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const servers = await prisma.server.findMany({
    include: { vendor: true, cloudType: true, period: true, client: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(servers)
}

interface ServerInput {
  name: string
  ipAddress?: string
  vendorId?: string
  cloudTypeId?: string
  clientId?: string
  core?: string
  ram?: string
  storage?: string
  dnsServer1?: string
  dnsServer2?: string
  periodId?: string
  periodCount?: number
  price?: number
  lastPaidAt?: string
  active?: boolean
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola master data" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as ServerInput | null
  if (!body?.name?.trim()) return NextResponse.json({ error: "Nama server wajib diisi" }, { status: 400 })

  const server = await prisma.server.create({
    data: {
      name: body.name.trim(),
      ipAddress: body.ipAddress || null,
      vendorId: body.vendorId || null,
      cloudTypeId: body.cloudTypeId || null,
      clientId: body.clientId || null,
      core: body.core || null,
      ram: body.ram || null,
      storage: body.storage || null,
      dnsServer1: body.dnsServer1 || null,
      dnsServer2: body.dnsServer2 || null,
      periodId: body.periodId || null,
      periodCount: body.periodCount || null,
      price: body.price ?? null,
      lastPaidAt: body.lastPaidAt ? new Date(body.lastPaidAt) : null,
      active: body.active ?? true,
    },
  })
  return NextResponse.json(server, { status: 201 })
}
