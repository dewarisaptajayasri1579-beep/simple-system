import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

const POSTED_PAYMENTS_WHERE = { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" as const } } }] }

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const projects = await prisma.project.findMany({
    include: {
      client: true,
      schedules: {
        orderBy: { sortOrder: "asc" },
        include: { invoice: { include: { payments: { where: POSTED_PAYMENTS_WHERE } } } },
      },
    },
    orderBy: { startDate: "desc" },
  })

  return NextResponse.json(projects)
}

interface ScheduleInput {
  label: string
  dueDate: string
  amount: number
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const clientId = typeof body?.clientId === "string" ? body.clientId : ""
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const startDate = typeof body?.startDate === "string" && body.startDate ? new Date(body.startDate) : null
  const schedules: ScheduleInput[] = Array.isArray(body?.schedules) ? body.schedules : []

  if (!clientId) return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 })
  if (!name) return NextResponse.json({ error: "Nama project wajib diisi" }, { status: 400 })
  if (!startDate) return NextResponse.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 })
  if (schedules.length === 0) return NextResponse.json({ error: "Minimal 1 baris jadwal pembayaran" }, { status: 400 })

  try {
    const preparedSchedules = schedules.map((s, index) => {
      const label = typeof s.label === "string" ? s.label.trim() : ""
      const dueDate = typeof s.dueDate === "string" && s.dueDate ? new Date(s.dueDate) : null
      const amount = Number(s.amount) || 0
      if (!label) throw new Error(`Jadwal baris ${index + 1}: label wajib diisi`)
      if (!dueDate) throw new Error(`Jadwal baris ${index + 1}: tanggal penagihan wajib diisi`)
      if (amount <= 0) throw new Error(`Jadwal baris ${index + 1}: nominal wajib diisi`)
      return { label, dueDate, amount, sortOrder: index }
    })

    const project = await prisma.project.create({
      data: {
        name,
        clientId,
        picName: typeof body?.picName === "string" ? body.picName || null : null,
        picPhone: typeof body?.picPhone === "string" ? body.picPhone || null : null,
        startDate,
        endDate: typeof body?.endDate === "string" && body.endDate ? new Date(body.endDate) : null,
        notes: typeof body?.notes === "string" ? body.notes || null : null,
        schedules: { create: preparedSchedules },
      },
      include: { client: true, schedules: { orderBy: { sortOrder: "asc" } } },
    })
    return NextResponse.json(project, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal membuat project" }, { status: 400 })
  }
}
