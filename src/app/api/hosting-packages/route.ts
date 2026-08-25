import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const packages = await prisma.hostingPackage.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(packages)
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "admin") return NextResponse.json({ error: "Cuma Owner/Admin yang bisa kelola master data" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama paket wajib diisi" }, { status: 400 })

  const pkg = await prisma.hostingPackage.create({ data: { name } })
  return NextResponse.json(pkg, { status: 201 })
}
