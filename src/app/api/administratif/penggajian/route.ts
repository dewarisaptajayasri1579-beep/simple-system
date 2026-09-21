import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"
import { resolvePeriodRange, countEffectiveDays, computePayrollItem } from "@/lib/hrd/payroll"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const periods = await prisma.payrollPeriod.findMany({
    orderBy: { period: "desc" },
    include: { items: { select: { netPay: true } }, _count: { select: { items: true } } },
  })

  return NextResponse.json({
    periods: periods.map((p) => ({
      id: p.id,
      period: p.period,
      status: p.status,
      paidAt: p.paidAt,
      employeeCount: p._count.items,
      totalNetPay: p.items.reduce((s, i) => s + i.netPay, 0),
    })),
  })
}

// "Hitung Periode Baru" / "Hitung Ulang" — recompute penuh (hapus & buat ulang semua
// PayrollItem), ditolak kalau periode sudah "posted" (dibayar).
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const period = typeof body?.period === "string" ? body.period.trim() : ""
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: "Format periode harus YYYY-MM" }, { status: 400 })

  const existing = await prisma.payrollPeriod.findUnique({ where: { period } })
  if (existing?.status === "posted") return NextResponse.json({ error: "Periode ini sudah dibayar, tidak bisa dihitung ulang" }, { status: 400 })

  const settings = await prisma.hrSettings.findUnique({ where: { id: "singleton" } })
  const tglCutoff = settings?.tglCutoff ?? 25
  const nominalLembur = settings?.nominalLembur ?? 173
  const premiKehadiran = settings?.premiKehadiran ?? 100000

  const { periodStart, periodEnd } = resolvePeriodRange(period, tglCutoff)

  const holidays = await prisma.nationalHoliday.findMany({ where: { date: { gte: periodStart, lte: periodEnd } } })
  const holidayDates = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)))
  const effectiveDays = countEffectiveDays(periodStart, periodEnd, holidayDates)

  const employees = await prisma.employee.findMany({ where: { status: { not: "NONAKTIF" } } })
  const employeeIds = employees.map((e) => e.id)

  const [attendanceRecords, leaveRequests] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: periodStart, lte: periodEnd } } }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: employeeIds }, date: { gte: periodStart, lte: periodEnd } } }),
  ])

  const attendanceByEmployee = new Map<string, typeof attendanceRecords>()
  for (const rec of attendanceRecords) {
    const list = attendanceByEmployee.get(rec.employeeId) ?? []
    list.push(rec)
    attendanceByEmployee.set(rec.employeeId, list)
  }
  const leaveDaysByEmployee = new Map<string, number>()
  for (const lr of leaveRequests) {
    leaveDaysByEmployee.set(lr.employeeId, (leaveDaysByEmployee.get(lr.employeeId) ?? 0) + 1)
  }

  const itemsToCreate = employees.map((emp) => {
    const records = attendanceByEmployee.get(emp.id) ?? []
    const daysPresent = records.filter((r) => r.checkInAt).length
    const overtimeMinutes = records.reduce((s, r) => s + Math.max(0, (r.workDurationMinutes ?? 0) - 540), 0)
    const hasLate = records.some((r) => r.checkInLate)
    const daysLeave = leaveDaysByEmployee.get(emp.id) ?? 0

    const computed = computePayrollItem(
      {
        employeeId: emp.id,
        basicSalary: emp.basicSalary ?? 0,
        positionAllowance: emp.positionAllowance ?? 0,
        dailyAttendanceAllowance: emp.dailyAttendanceAllowance ?? 0,
        dailyTransportAllowance: emp.dailyTransportAllowance ?? 0,
        bpjsKesehatanDeduction: emp.bpjsKesehatanDeduction ?? 0,
        bpjsKetenagakerjaanDeduction: emp.bpjsKetenagakerjaanDeduction ?? 0,
      },
      { daysPresent, overtimeMinutes, hasLate },
      daysLeave,
      effectiveDays,
      nominalLembur,
      premiKehadiran
    )

    return { employeeId: emp.id, ...computed }
  })

  const period_ = await prisma.$transaction(async (tx) => {
    const payrollPeriod = await tx.payrollPeriod.upsert({
      where: { period },
      create: { period, periodStart, periodEnd, effectiveDays, createdById: user.id },
      update: { periodStart, periodEnd, effectiveDays },
    })
    await tx.payrollItem.deleteMany({ where: { payrollPeriodId: payrollPeriod.id } })
    await tx.payrollItem.createMany({
      data: itemsToCreate.map((item) => ({ payrollPeriodId: payrollPeriod.id, ...item })),
    })
    return payrollPeriod
  })

  await logAudit({ actorUserId: user.id, action: "administratif.penggajian.hitung", entityType: "payroll_period", entityId: period_.id, after: { period, employeeCount: itemsToCreate.length } })

  return NextResponse.json({ period: period_ }, { status: 201 })
}
