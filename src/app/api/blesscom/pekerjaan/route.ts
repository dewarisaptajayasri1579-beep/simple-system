import { NextResponse } from "next/server"

import { BLESSCOM_WORK_ROLES, parseWorkDate, parseWorkOrderItems } from "@/lib/blesscom-work-order"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Transaksi pekerjaan Blesscom baru — master (tanggal + principle) beserta detail pekerjaannya. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!BLESSCOM_WORK_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Cuma Owner/Direktur/Admin yang bisa mencatat pekerjaan" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { principleId?: string; workDate?: string; notes?: string; items?: unknown }
    | null

  const principleId = body?.principleId
  if (!principleId) return NextResponse.json({ error: "Principle wajib dipilih" }, { status: 400 })

  const workDate = parseWorkDate(body?.workDate)
  if (!workDate) return NextResponse.json({ error: "Tanggal wajib diisi" }, { status: 400 })

  const parsed = parseWorkOrderItems(body?.items)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const principle = await prisma.principle.findUnique({ where: { id: principleId }, select: { id: true } })
  if (!principle) return NextResponse.json({ error: "Principle tidak ditemukan" }, { status: 404 })

  const created = await prisma.blesscomWorkOrder.create({
    data: {
      principleId,
      workDate,
      notes: body?.notes?.trim() || null,
      createdById: user.id,
      items: { create: parsed.items },
    },
    select: { id: true },
  })

  return NextResponse.json(created, { status: 201 })
}
