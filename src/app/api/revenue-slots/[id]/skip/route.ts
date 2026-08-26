import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Tandai 1 Slotting Omset draft sebagai "Tidak Split" — dipakai kalau payment ini memang tidak
 *  perlu dibagi (mis. bukan pendapatan project, internal, dsb). Tidak ada Pindah Buku/jurnal
 *  apa pun yang dibuat, cuma menutup draft-nya supaya tidak nyangkut terus di antrean. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const slot = await prisma.revenueSlot.findUnique({ where: { id } })
  if (!slot) return NextResponse.json({ error: "Slotting Omset tidak ditemukan" }, { status: 404 })
  if (slot.status !== "draft") return NextResponse.json({ error: "Sudah diproses/ditandai sebelumnya" }, { status: 400 })

  const updated = await prisma.revenueSlot.update({
    where: { id },
    data: { status: "skipped", processedAt: new Date(), processedById: user.id },
  })
  return NextResponse.json(updated)
}
