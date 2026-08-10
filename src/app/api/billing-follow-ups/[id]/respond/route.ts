import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { recordBillingFollowUpResponse, CLIENT_RESPONSE_TYPES, type ClientResponseType } from "@/lib/billing-follow-up"

/** Input Respon Client — dipakai di Dashboard > Piutang (dan masih dipakai juga oleh baris
 *  Domain/Server/Maintenance yang lama). Tiap panggilan JADI BARIS BARU di log
 *  (BillingFollowUpResponse), bukan menimpa — supaya histori follow-up 1 piutang kelihatan
 *  lengkap. Lihat recordBillingFollowUpResponse di billing-follow-up.ts. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const responseType = typeof body?.responseType === "string" ? body.responseType : ""
  if (!CLIENT_RESPONSE_TYPES.includes(responseType as ClientResponseType)) {
    return NextResponse.json({ error: "Tipe respon tidak valid" }, { status: 400 })
  }
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null
  const promisedPayAtRaw = typeof body?.promisedPayAt === "string" ? body.promisedPayAt : ""
  if (responseType === "janji_bayar" && !promisedPayAtRaw) {
    return NextResponse.json({ error: "Tanggal janji bayar wajib diisi kalau tipe respon Janji Bayar" }, { status: 400 })
  }

  const followUp = await prisma.billingFollowUp.findUnique({ where: { id } })
  if (!followUp) return NextResponse.json({ error: "Data tindak-lanjut tidak ditemukan" }, { status: 404 })
  if (followUp.paidRecordedAt) return NextResponse.json({ error: "Siklus tagihan ini sudah selesai" }, { status: 400 })

  const updated = await recordBillingFollowUpResponse(prisma, {
    billingFollowUpId: id,
    responseType: responseType as ClientResponseType,
    note,
    promisedPayAt: promisedPayAtRaw ? new Date(promisedPayAtRaw) : null,
    createdById: user.id,
  })

  return NextResponse.json(updated)
}
