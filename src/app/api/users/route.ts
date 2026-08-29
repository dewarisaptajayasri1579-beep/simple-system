import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { hashPassword } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola user" }, { status: 403 })

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, phoneNumber: true, modules: true, isActive: true, createdAt: true },
  })
  return NextResponse.json(users)
}

const VALID_MODULES = ["internal", "marketing", "monitoring"]

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola user" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body?.password === "string" ? body.password : ""
  const role = ["owner", "direktur", "admin"].includes(body?.role) ? body.role : "admin"
  const modules: string[] = Array.isArray(body?.modules) ? body.modules.filter((m: unknown) => VALID_MODULES.includes(m as string)) : ["internal"]

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Nama, email, dan password wajib diisi" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 })

  const created = await prisma.user.create({
    data: { name, email, role, phoneNumber: body?.phoneNumber || null, modules, passwordHash: hashPassword(password) },
    select: { id: true, name: true, email: true, role: true, phoneNumber: true, modules: true, isActive: true, createdAt: true },
  })

  return NextResponse.json(created, { status: 201 })
}
