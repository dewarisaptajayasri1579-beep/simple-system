import { NextResponse } from "next/server"

import { createSession, verifyPassword } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body?.password === "string" ? body.password : ""

  if (!email || !password) {
    return NextResponse.json({ error: "Email dan password wajib diisi" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Email atau password salah" }, { status: 401 })
  }

  await createSession(user.id)

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } })
}
