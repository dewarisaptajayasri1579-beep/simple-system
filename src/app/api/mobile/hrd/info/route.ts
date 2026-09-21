import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getEmployeeFromToken } from "@/lib/hrd/auth"

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(request: Request) {
  const employee = await getEmployeeFromToken(request)
  if (!employee) return NextResponse.json({ error: "Sesi tidak valid, silakan login ulang" }, { status: 401 })

  const today = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: startOfToday() } },
  })

  return NextResponse.json({
    employee: { id: employee.id, name: employee.name, position: employee.position },
    today: today
      ? {
          status: today.status,
          checkInAt: today.checkInAt,
          checkOutAt: today.checkOutAt,
        }
      : null,
  })
}
