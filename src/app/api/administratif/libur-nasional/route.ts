import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const holidays = await prisma.nationalHoliday.findMany({ orderBy: { date: "asc" } })
  return NextResponse.json({ holidays })
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const dateStr = typeof body?.date === "string" ? body.date : ""
  if (!name || !dateStr) return NextResponse.json({ error: "Nama & tanggal wajib diisi" }, { status: 400 })

  const holiday = await prisma.nationalHoliday.create({ data: { name, date: new Date(dateStr) } })
  return NextResponse.json({ holiday }, { status: 201 })
}
