import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const sim = await prisma.workPriceSimulation.findUnique({ where: { id }, select: { createdById: true } })
  if (!sim) return NextResponse.json({ error: "Simulasi tidak ditemukan" }, { status: 404 })

  // Staf boleh hapus simulasi buatannya sendiri; Owner/Direktur boleh hapus punya siapa pun.
  const isOwnerLevel = ["owner", "direktur"].includes(user.role)
  if (!isOwnerLevel && sim.createdById !== user.id) {
    return NextResponse.json({ error: "Cuma pembuatnya (atau Owner/Direktur) yang bisa menghapus simulasi ini" }, { status: 403 })
  }

  await prisma.workPriceSimulation.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
