import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getEmployeeFromToken } from "@/lib/hrd/auth"

export async function GET(request: Request) {
  const employee = await getEmployeeFromToken(request)
  if (!employee) return NextResponse.json({ error: "Sesi tidak valid, silakan login ulang" }, { status: 401 })

  const url = new URL(request.url)
  const tglawal = url.searchParams.get("tglawal")
  const tglakhir = url.searchParams.get("tglakhir")

  const rows = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: employee.id,
      ...(tglawal || tglakhir
        ? { date: { ...(tglawal ? { gte: new Date(tglawal) } : {}), ...(tglakhir ? { lte: new Date(tglakhir) } : {}) } }
        : {}),
    },
    orderBy: { date: "desc" },
    take: 90,
  })

  return NextResponse.json({ rows })
}
