import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get("clientId")

  const domains = await prisma.domain.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(domains)
}

interface DomainInput {
  name: string
  clientId?: string
  sellPrice?: number
  lastPaidAt?: string
  expiryDate?: string
  active?: boolean
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola master data" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as DomainInput | null
  if (!body?.name?.trim()) return NextResponse.json({ error: "Nama domain wajib diisi" }, { status: 400 })

  try {
    const domain = await prisma.domain.create({
      data: {
        name: body.name.trim(),
        clientId: body.clientId || null,
        sellPrice: body.sellPrice ?? null,
        lastPaidAt: body.lastPaidAt ? new Date(body.lastPaidAt) : null,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        active: body.active ?? true,
      },
      include: { client: true },
    })
    return NextResponse.json(domain, { status: 201 })
  } catch (err) {
    console.error("[POST /api/domains]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat domain" }, { status: 500 })
  }
}
