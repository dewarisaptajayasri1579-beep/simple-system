import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

function startOfDay(input: string) {
  const d = new Date(input)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const url = new URL(request.url)
  const tglawal = url.searchParams.get("tglawal")
  const tglakhir = url.searchParams.get("tglakhir")
  const employeeId = url.searchParams.get("employeeId")

  const records = await prisma.attendanceRecord.findMany({
    where: {
      ...(employeeId ? { employeeId } : {}),
      ...(tglawal || tglakhir
        ? { date: { ...(tglawal ? { gte: startOfDay(tglawal) } : {}), ...(tglakhir ? { lte: startOfDay(tglakhir) } : {}) } }
        : {}),
    },
    include: { employee: { select: { id: true, name: true, position: true } } },
    orderBy: [{ date: "desc" }],
    take: 500,
  })

  return NextResponse.json({ records })
}

// Koreksi manual oleh HR/Admin — dipakai untuk lupa absen, kendala device, dst. Sama pola
// dengan sistem lama (Input Absen Manual) tapi tanpa foto/GPS (bukan absen mandiri).
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const employeeId = typeof body?.employeeId === "string" ? body.employeeId : ""
  const dateStr = typeof body?.date === "string" ? body.date : ""
  if (!employeeId || !dateStr) return NextResponse.json({ error: "Karyawan & tanggal wajib diisi" }, { status: 400 })

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } })
  if (!employee) return NextResponse.json({ error: "Karyawan tidak ditemukan" }, { status: 404 })

  const date = startOfDay(dateStr)
  const checkInAt = typeof body?.checkInAt === "string" && body.checkInAt ? new Date(body.checkInAt) : null
  const checkOutAt = typeof body?.checkOutAt === "string" && body.checkOutAt ? new Date(body.checkOutAt) : null
  const workDurationMinutes = checkInAt && checkOutAt ? Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000) : null
  const status = checkOutAt ? "C" : checkInAt ? "I" : "O"

  const record = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, status, checkInAt, checkOutAt, workDurationMinutes, source: "manual", createdById: user.id },
    update: { status, checkInAt, checkOutAt, workDurationMinutes, source: "manual", createdById: user.id },
  })
  await logAudit({ actorUserId: user.id, action: "administratif.absensi.koreksi-manual", entityType: "attendance_record", entityId: record.id, after: record })

  return NextResponse.json({ record }, { status: 201 })
}
