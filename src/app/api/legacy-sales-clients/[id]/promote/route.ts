import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Buat Client asli dari 1 baris staging LegacySalesClient (dipilih manual oleh staf setelah
 *  membandingkan dengan client yang sudah ada — lihat catatan di schema.prisma). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const staged = await prisma.legacySalesClient.findUnique({ where: { id }, include: { client: true } })
  if (!staged) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 })
  if (staged.client) return NextResponse.json({ error: "Sudah punya Client, tidak bisa dipromote lagi" }, { status: 400 })

  const client = await prisma.client.create({
    data: {
      name: staged.name,
      phoneNumber: staged.phoneNumber,
      address: staged.address,
      legacySalesClientId: staged.id,
    },
  })

  return NextResponse.json(client, { status: 201 })
}
