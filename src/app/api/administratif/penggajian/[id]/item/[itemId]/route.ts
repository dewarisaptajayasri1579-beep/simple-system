import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"
import { logAudit } from "@/lib/audit"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

// Field manual yang boleh diedit HR sebelum periode dibayar — lihat komentar "editable HR"
// di model PayrollItem. grossPay/totalDeduction/netPay dihitung ulang di sini.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id, itemId } = await params
  const item = await prisma.payrollItem.findUnique({ where: { id: itemId } })
  if (!item || item.payrollPeriodId !== id) return NextResponse.json({ error: "Item gaji tidak ditemukan" }, { status: 404 })

  const period = await prisma.payrollPeriod.findUnique({ where: { id } })
  if (period?.status === "posted") return NextResponse.json({ error: "Periode ini sudah dibayar, tidak bisa diedit" }, { status: 400 })

  const body = await request.json().catch(() => null)
  const otherEarnings = typeof body?.otherEarnings === "number" ? body.otherEarnings : item.otherEarnings
  const bpjsKesehatan = typeof body?.bpjsKesehatan === "number" ? body.bpjsKesehatan : item.bpjsKesehatan
  const bpjsKetenagakerjaan = typeof body?.bpjsKetenagakerjaan === "number" ? body.bpjsKetenagakerjaan : item.bpjsKetenagakerjaan
  const kasbonDeduction = typeof body?.kasbonDeduction === "number" ? body.kasbonDeduction : item.kasbonDeduction
  const otherDeductions = typeof body?.otherDeductions === "number" ? body.otherDeductions : item.otherDeductions

  const grossPay = item.basicSalary + item.positionAllowance + item.attendanceAllowance + item.transportAllowance + item.overtimePay + item.attendanceBonus + otherEarnings
  const totalDeduction = bpjsKesehatan + bpjsKetenagakerjaan + kasbonDeduction + otherDeductions
  const netPay = grossPay - totalDeduction

  const updated = await prisma.payrollItem.update({
    where: { id: itemId },
    data: { otherEarnings, bpjsKesehatan, bpjsKetenagakerjaan, kasbonDeduction, otherDeductions, grossPay, totalDeduction, netPay },
  })
  await logAudit({ actorUserId: user.id, action: "administratif.penggajian.edit-item", entityType: "payroll_item", entityId: itemId, before: item, after: updated })

  return NextResponse.json({ item: updated })
}
