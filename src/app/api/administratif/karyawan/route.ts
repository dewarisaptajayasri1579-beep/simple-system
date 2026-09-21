import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"
import { hashPassword } from "@/lib/hrd/auth"
import { EMPLOYEE_SELECT } from "@/lib/hrd/employee-select"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const employees = await prisma.employee.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }], select: EMPLOYEE_SELECT })
  return NextResponse.json({ employees })
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 })

  const position = typeof body?.position === "string" && body.position.trim() ? body.position.trim() : null
  const status = ["AKTIF", "NONAKTIF", "KONTRAK", "TETAP"].includes(body?.status) ? body.status : "AKTIF"
  const joinDate = typeof body?.joinDate === "string" && body.joinDate ? new Date(body.joinDate) : null
  const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null
  const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim() : null
  const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null
  const username = typeof body?.username === "string" && body.username.trim() ? body.username.trim() : null
  const password = typeof body?.password === "string" && body.password ? body.password : null
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const basicSalary = num(body?.basicSalary)
  const positionAllowance = num(body?.positionAllowance)
  const dailyAttendanceAllowance = num(body?.dailyAttendanceAllowance)
  const dailyTransportAllowance = num(body?.dailyTransportAllowance)
  const bpjsKesehatanDeduction = num(body?.bpjsKesehatanDeduction)
  const bpjsKetenagakerjaanDeduction = num(body?.bpjsKetenagakerjaanDeduction)

  if (username) {
    const existing = await prisma.employee.findUnique({ where: { username } })
    if (existing) return NextResponse.json({ error: `Username "${username}" sudah dipakai` }, { status: 400 })
  }

  const employee = await prisma.employee.create({
    data: {
      name, position, status, joinDate, phone, email, notes, username,
      passwordHash: password ? hashPassword(password) : null,
      basicSalary, positionAllowance, dailyAttendanceAllowance, dailyTransportAllowance,
      bpjsKesehatanDeduction, bpjsKetenagakerjaanDeduction,
    },
    select: EMPLOYEE_SELECT,
  })
  await logAudit({ actorUserId: user.id, action: "administratif.karyawan.create", entityType: "employee", entityId: employee.id, after: employee })

  return NextResponse.json({ employee }, { status: 201 })
}
