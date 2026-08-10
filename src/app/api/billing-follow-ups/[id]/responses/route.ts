import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Histori Respon Client 1 siklus BillingFollowUp — urut terbaru dulu, dipakai buat expand
 *  "lihat histori follow-up" di Dashboard > Piutang. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const responses = await prisma.billingFollowUpResponse.findMany({
    where: { billingFollowUpId: id },
    orderBy: { createdAt: "desc" },
  })

  const userIds = [...new Set(responses.map((r) => r.createdById))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const nameById = new Map(users.map((u) => [u.id, u.name]))

  return NextResponse.json(
    responses.map((r) => ({
      id: r.id,
      responseType: r.responseType,
      note: r.note,
      promisedPayAt: r.promisedPayAt ? r.promisedPayAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      createdByName: nameById.get(r.createdById) ?? "-",
    }))
  )
}
