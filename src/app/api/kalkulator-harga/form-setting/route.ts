import { NextResponse } from "next/server"

import { hashPassword } from "@/lib/auth"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Atur password form pengajuan (dipakai bersama semua programmer). Mengganti password juga
 *  mencabut semua sesi form yang masih aktif, supaya link lama tidak bisa dipakai lagi. */
export async function PUT(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!["owner", "direktur"].includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mengatur password form" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null
  const password = body?.password?.trim()
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 })
  }

  await prisma.workRequestSetting.upsert({
    where: { id: "default" },
    update: { passwordHash: hashPassword(password) },
    create: { id: "default", passwordHash: hashPassword(password) },
  })
  await prisma.workFormSession.deleteMany({})

  return NextResponse.json({ ok: true })
}
