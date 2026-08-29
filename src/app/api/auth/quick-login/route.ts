import { NextResponse } from "next/server"

import { createSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** Daftar user yang boleh dipakai buat "Login cepat" (tanpa password) di halaman login —
 *  cuma role owner, dan cuma nama+id yang dikirim ke client (bukan email/data lain). Dipakai
 *  supaya link laporan dashboard di WA Grup bisa langsung dipakai tanpa ketik password tiap kali,
 *  karena grup itu memang cuma berisi Owner-owner yang sama. */
export async function GET() {
  const owners = await prisma.user.findMany({
    where: { role: "owner", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json({ users: owners })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const userId = typeof body?.userId === "string" ? body.userId : ""
  if (!userId) return NextResponse.json({ error: "userId wajib diisi" }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.role !== "owner" || !user.isActive) {
    return NextResponse.json({ error: "User tidak ditemukan" }, { status: 404 })
  }

  await createSession(user.id)

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } })
}
