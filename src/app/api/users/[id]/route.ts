import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola user" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)

  const data: { role?: string; phoneNumber?: string | null } = {}
  if (body?.role !== undefined) {
    if (!["owner", "direktur", "admin"].includes(body.role)) {
      return NextResponse.json({ error: "Role tidak valid" }, { status: 400 })
    }
    data.role = body.role
  }
  if (typeof body?.phoneNumber === "string") data.phoneNumber = body.phoneNumber || null

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, phoneNumber: true },
  })
  return NextResponse.json(updated)
}
