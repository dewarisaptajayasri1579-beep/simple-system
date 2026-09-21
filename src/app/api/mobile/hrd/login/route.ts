import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { createEmployeeSession, verifyPassword } from "@/lib/hrd/auth"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const username = typeof body?.username === "string" ? body.username.trim() : ""
  const password = typeof body?.password === "string" ? body.password : ""
  if (!username || !password) return NextResponse.json({ error: "Username & password wajib diisi" }, { status: 400 })

  const employee = await prisma.employee.findUnique({ where: { username } })
  if (!employee || !employee.passwordHash || !verifyPassword(password, employee.passwordHash)) {
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 })
  }
  if (employee.status === "NONAKTIF") return NextResponse.json({ error: "Akun karyawan nonaktif" }, { status: 403 })

  const session = await createEmployeeSession(employee.id)

  return NextResponse.json({
    token: session.id,
    employee: { id: employee.id, name: employee.name, position: employee.position },
  })
}
