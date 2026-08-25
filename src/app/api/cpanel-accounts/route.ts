import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const accounts = await prisma.cpanelAccount.findMany({
    include: { cloudType: true, package: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(accounts)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "admin") return NextResponse.json({ error: "Cuma Owner/Admin yang bisa kelola master data" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama akun cPanel wajib diisi" }, { status: 400 })

  const account = await prisma.cpanelAccount.create({
    data: {
      name,
      username: body?.username || null,
      password: body?.password || null,
      cloudTypeId: body?.cloudTypeId || null,
      packageId: body?.packageId || null,
      active: body?.active ?? true,
    },
  })
  return NextResponse.json(account, { status: 201 })
}
