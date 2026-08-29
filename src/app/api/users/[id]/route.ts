import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola user" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)

  const data: { role?: string; phoneNumber?: string | null; modules?: string[]; isActive?: boolean } = {}
  if (body?.role !== undefined) {
    if (!["owner", "direktur", "admin"].includes(body.role)) {
      return NextResponse.json({ error: "Role tidak valid" }, { status: 400 })
    }
    data.role = body.role
  }
  if (typeof body?.phoneNumber === "string") data.phoneNumber = body.phoneNumber || null
  if (Array.isArray(body?.modules)) {
    const valid = ["internal", "marketing", "monitoring"]
    if (body.modules.some((m: unknown) => !valid.includes(m as string))) {
      return NextResponse.json({ error: "Modul tidak valid" }, { status: 400 })
    }
    data.modules = body.modules
  }
  if (typeof body?.isActive === "boolean") {
    if (!body.isActive) {
      if (id === user.id) {
        return NextResponse.json({ error: "Tidak bisa menonaktifkan akun sendiri." }, { status: 400 })
      }
      const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
      if (!target) return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 })
      if (target.role === "owner") {
        return NextResponse.json({ error: "Akun Owner tidak bisa dinonaktifkan." }, { status: 400 })
      }
    }
    data.isActive = body.isActive
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, phoneNumber: true, modules: true, isActive: true },
  })

  // Nonaktif → cabut semua sesi login user itu supaya langsung ter-logout di semua device.
  if (data.isActive === false) {
    await prisma.session.deleteMany({ where: { userId: id } })
  }

  return NextResponse.json(updated)
}
