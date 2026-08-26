import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id, lineId } = await params
  const slot = await prisma.revenueSlot.findUnique({ where: { id } })
  if (!slot) return NextResponse.json({ error: "Slotting Omset tidak ditemukan" }, { status: 404 })
  if (slot.status !== "draft") return NextResponse.json({ error: "Sudah diproses, tidak bisa hapus biaya" }, { status: 400 })

  const line = await prisma.revenueSlotCostLine.findUnique({ where: { id: lineId } })
  if (!line || line.revenueSlotId !== id) return NextResponse.json({ error: "Baris biaya tidak ditemukan" }, { status: 404 })

  const [, updated] = await prisma.$transaction([
    prisma.revenueSlotCostLine.delete({ where: { id: lineId } }),
    prisma.revenueSlot.update({
      where: { id },
      data: { additionalCostAmount: { decrement: line.amount } },
    }),
  ])

  return NextResponse.json(updated)
}
