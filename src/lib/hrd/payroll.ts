// Mesin hitung Penggajian — dipanggil dari POST /api/administratif/penggajian saat HR
// "Hitung Periode Baru"/"Hitung Ulang". Formula & simplifikasi v1 dijelaskan di
// docs/administratif-hrd-absensi-penggajian.md §2 dan plan Payroll.

/** "YYYY-MM" + tanggal cutoff (mis. 25) -> rentang periode: (cutoff+1 bulan lalu) s.d.
 *  (cutoff bulan ini). Sama formula dengan sistem lama. */
export function resolvePeriodRange(period: string, tglCutoff: number) {
  const [yearStr, monthStr] = period.split("-")
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) // 1-12

  const periodEnd = new Date(year, month - 1, tglCutoff, 23, 59, 59, 999)
  const periodStart = new Date(year, month - 2, tglCutoff + 1, 0, 0, 0, 0)

  return { periodStart, periodEnd }
}

/** Hari kerja efektif dalam rentang — Senin-Jumat, exclude tanggal di `holidayDates`
 *  (dibandingkan by date string biar tidak kepeleset timezone). */
export function countEffectiveDays(periodStart: Date, periodEnd: Date, holidayDates: Set<string>): number {
  let count = 0
  const cursor = new Date(periodStart)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(periodEnd)
  end.setHours(0, 0, 0, 0)

  while (cursor <= end) {
    const day = cursor.getDay() // 0=Minggu, 6=Sabtu
    const key = cursor.toISOString().slice(0, 10)
    if (day !== 0 && day !== 6 && !holidayDates.has(key)) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export interface PayrollEmployeeInput {
  employeeId: string
  basicSalary: number
  positionAllowance: number
  dailyAttendanceAllowance: number
  dailyTransportAllowance: number
  bpjsKesehatanDeduction: number
  bpjsKetenagakerjaanDeduction: number
}

export interface PayrollAttendanceStat {
  daysPresent: number
  overtimeMinutes: number
  hasLate: boolean
}

/** Hitung 1 baris PayrollItem dari data master Employee + rekap absensi periode itu. */
export function computePayrollItem(
  employee: PayrollEmployeeInput,
  attendance: PayrollAttendanceStat,
  daysLeave: number,
  effectiveDays: number,
  nominalLembur: number,
  premiKehadiran: number
) {
  const daysPresent = attendance.daysPresent
  const daysAbsent = Math.max(0, effectiveDays - daysPresent - daysLeave)

  const attendanceAllowance = employee.dailyAttendanceAllowance * daysPresent
  const transportAllowance = employee.dailyTransportAllowance * daysPresent
  const overtimePay = employee.basicSalary > 0 && nominalLembur > 0 ? (employee.basicSalary / nominalLembur) * (attendance.overtimeMinutes / 60) : 0
  const attendanceBonus = daysAbsent === 0 && !attendance.hasLate ? premiKehadiran : 0
  const proratedBasicSalary = effectiveDays > 0 ? employee.basicSalary * (daysPresent / effectiveDays) : 0

  const grossPay = proratedBasicSalary + employee.positionAllowance + attendanceAllowance + transportAllowance + overtimePay + attendanceBonus
  const totalDeduction = employee.bpjsKesehatanDeduction + employee.bpjsKetenagakerjaanDeduction
  const netPay = grossPay - totalDeduction

  return {
    basicSalary: proratedBasicSalary,
    positionAllowance: employee.positionAllowance,
    attendanceAllowance,
    transportAllowance,
    overtimeMinutes: attendance.overtimeMinutes,
    overtimePay,
    attendanceBonus,
    bpjsKesehatan: employee.bpjsKesehatanDeduction,
    bpjsKetenagakerjaan: employee.bpjsKetenagakerjaanDeduction,
    daysPresent,
    daysLeave,
    daysAbsent,
    grossPay,
    totalDeduction,
    netPay,
  }
}
