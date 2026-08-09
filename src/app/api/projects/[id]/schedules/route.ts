import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const label = typeof body?.label === "string" ? body.label.trim() : ""
  const dueDate = typeof body?.dueDate === "string" && body.dueDate ? new Date(body.dueDate) : null
  const amount = Number(body?.amount) || 0

  if (!label) return NextResponse.json({ error: "Label termin wajib diisi" }, { status: 400 })
  if (!dueDate) return NextResponse.json({ error: "Tanggal penagihan wajib diisi" }, { status: 400 })
  if (amount <= 0) return NextResponse.json({ error: "Nominal wajib diisi" }, { status: 400 })

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: "Project tidak ditemukan" }, { status: 404 })

  const lastSort = await prisma.projectPaymentSchedule.count({ where: { projectId: id } })

  const schedule = await prisma.projectPaymentSchedule.create({
    data: { projectId: id, label, dueDate, amount, sortOrder: lastSort },
  })

  return NextResponse.json(schedule, { status: 201 })
}
