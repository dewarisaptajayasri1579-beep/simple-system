import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

const POSTED_PAYMENTS_WHERE = { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" as const } } }] }

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      schedules: {
        orderBy: { dueDate: "asc" },
        include: { invoice: { include: { payments: { where: POSTED_PAYMENTS_WHERE } } } },
      },
    },
  })
  if (!project) return NextResponse.json({ error: "Project tidak ditemukan" }, { status: 404 })

  return NextResponse.json(project)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === "string") data.name = body.name.trim()
  if (typeof body.picName === "string") data.picName = body.picName || null
  if (typeof body.picPhone === "string") data.picPhone = body.picPhone || null
  if (typeof body.endDate === "string") data.endDate = body.endDate ? new Date(body.endDate) : null
  if (typeof body.status === "string") data.status = body.status
  if (typeof body.notes === "string") data.notes = body.notes || null

  try {
    const project = await prisma.project.update({ where: { id }, data, include: { client: true } })
    return NextResponse.json(project)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal mengubah project" }, { status: 400 })
  }
}
