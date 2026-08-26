import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const slot = await prisma.revenueSlot.findUnique({ where: { id } })
  if (!slot) return NextResponse.json({ error: "Slotting Omset tidak ditemukan" }, { status: 404 })
  if (slot.status !== "draft") return NextResponse.json({ error: "Sudah diproses, tidak bisa tambah biaya lagi" }, { status: 400 })

  const body = await request.json().catch(() => null)
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const amount = Number(body?.amount)
  if (!description) return NextResponse.json({ error: "Deskripsi biaya wajib diisi" }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Nominal biaya wajib lebih dari 0" }, { status: 400 })

  const [, updated] = await prisma.$transaction([
    prisma.revenueSlotCostLine.create({ data: { revenueSlotId: id, description, amount } }),
    prisma.revenueSlot.update({
      where: { id },
      data: { additionalCostAmount: { increment: amount } },
    }),
  ])

  return NextResponse.json(updated, { status: 201 })
}
