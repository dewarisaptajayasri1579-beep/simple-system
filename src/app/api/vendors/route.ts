import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(vendors)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola master data" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama vendor wajib diisi" }, { status: 400 })

  const vendor = await prisma.vendor.create({ data: { name, website: body?.website || null } })
  return NextResponse.json(vendor, { status: 201 })
}
