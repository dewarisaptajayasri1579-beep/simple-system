import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
  })

  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  return NextResponse.json(payment)
}
