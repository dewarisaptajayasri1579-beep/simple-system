import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const bills = await prisma.recurringBill.findMany({
    include: { vendor: true, period: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(bills)
}

interface RecurringBillInput {
  name: string
  identifier?: string
  vendorId?: string
  category?: string
  periodId?: string
  periodCount?: number
  payDayOfWeek?: number
  price?: number
  lastPaidAt?: string
  active?: boolean
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "admin") return NextResponse.json({ error: "Cuma Owner/Admin yang bisa kelola master data" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as RecurringBillInput | null
  if (!body?.name?.trim()) return NextResponse.json({ error: "Nama biaya berkala wajib diisi" }, { status: 400 })

  const bill = await prisma.recurringBill.create({
    data: {
      name: body.name.trim(),
      identifier: body.identifier || null,
      vendorId: body.vendorId || null,
      category: body.category || "kantor",
      periodId: body.periodId || null,
      periodCount: body.periodCount || null,
      payDayOfWeek: body.payDayOfWeek || null,
      price: body.price ?? null,
      lastPaidAt: body.lastPaidAt ? new Date(body.lastPaidAt) : null,
      active: body.active ?? true,
    },
    include: { vendor: true, period: true },
  })
  return NextResponse.json(bill, { status: 201 })
}
