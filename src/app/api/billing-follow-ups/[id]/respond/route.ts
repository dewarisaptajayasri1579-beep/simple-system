import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Tahap 2 SLA tindak-lanjut tagihan (lihat sop.txt) — staf catat "Client sudah jawab, janji
 *  bayar tanggal X" setelah menghubungi Client soal invoice yang dibuat dari "Tagih Sekarang". */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const promisedPayAtRaw = typeof body?.promisedPayAt === "string" ? body.promisedPayAt : ""
  if (!promisedPayAtRaw) return NextResponse.json({ error: "Tanggal janji bayar wajib diisi" }, { status: 400 })

  const followUp = await prisma.billingFollowUp.findUnique({ where: { id } })
  if (!followUp) return NextResponse.json({ error: "Data tindak-lanjut tidak ditemukan" }, { status: 404 })
  if (followUp.paidRecordedAt) return NextResponse.json({ error: "Siklus tagihan ini sudah selesai" }, { status: 400 })

  const updated = await prisma.billingFollowUp.update({
    where: { id },
    data: { clientRespondedAt: new Date(), promisedPayAt: new Date(promisedPayAtRaw) },
  })

  return NextResponse.json(updated)
}
