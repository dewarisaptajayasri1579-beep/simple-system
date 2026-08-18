import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(clients)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama client wajib diisi" }, { status: 400 })

  const client = await prisma.client.create({
    data: {
      name,
      email: body?.email || null,
      phoneNumber: body?.phoneNumber || null,
      picName: body?.picName || null,
      picPhone: body?.picPhone || null,
      city: body?.city || null,
      address: body?.address || null,
      notes: body?.notes || null,
      isPemungutPpn: Boolean(body?.isPemungutPpn),
    },
  })

  return NextResponse.json(client, { status: 201 })
}
