import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "admin") return NextResponse.json({ error: "Cuma Owner/Admin yang bisa kelola master data" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body?.name?.trim()) return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 })

  const cloudType = await prisma.cloudType.update({ where: { id }, data: { name: body.name.trim() } })
  return NextResponse.json(cloudType)
}
