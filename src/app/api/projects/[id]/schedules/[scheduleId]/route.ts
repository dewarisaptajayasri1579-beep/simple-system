import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; scheduleId: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { scheduleId } = await params
  const schedule = await prisma.projectPaymentSchedule.findUnique({ where: { id: scheduleId } })
  if (!schedule) return NextResponse.json({ error: "Jadwal pembayaran tidak ditemukan" }, { status: 404 })
  if (schedule.invoiceId) {
    return NextResponse.json(
      { error: "Termin ini sudah punya invoice — ubah nominal lewat Invoice-nya, bukan di sini" },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => null)
  const data: Record<string, unknown> = {}
  if (typeof body?.label === "string" && body.label.trim()) data.label = body.label.trim()
  if (typeof body?.dueDate === "string" && body.dueDate) data.dueDate = new Date(body.dueDate)
  if (body?.amount !== undefined) {
    const amount = Number(body.amount) || 0
    if (amount <= 0) return NextResponse.json({ error: "Nominal wajib diisi" }, { status: 400 })
    data.amount = amount
  }

  const updated = await prisma.projectPaymentSchedule.update({ where: { id: scheduleId }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; scheduleId: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { scheduleId } = await params
  const schedule = await prisma.projectPaymentSchedule.findUnique({ where: { id: scheduleId } })
  if (!schedule) return NextResponse.json({ error: "Jadwal pembayaran tidak ditemukan" }, { status: 404 })
  if (schedule.invoiceId) {
    return NextResponse.json({ error: "Termin yang sudah punya invoice tidak bisa dihapus" }, { status: 400 })
  }

  await prisma.projectPaymentSchedule.delete({ where: { id: scheduleId } })
  return NextResponse.json({ ok: true })
}
