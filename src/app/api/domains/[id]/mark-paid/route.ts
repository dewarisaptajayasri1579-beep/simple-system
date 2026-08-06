import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { markDomainPaid } from "@/lib/accounting/mark-paid"

/** "Tandai Lunas" — beda dari PATCH generik: ini merekam pembayaran sungguhan (bikin
 *  Transaction cash-basis + jurnal akrual), bukan cuma koreksi tanggal. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola master data" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })

  const paidAt = body?.paidAt ? new Date(body.paidAt) : new Date()

  try {
    const result = await prisma.$transaction((tx) =>
      markDomainPaid(tx, { domainId: id, accountId, paidAt, createdBy: user.id })
    )
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menandai lunas" }, { status: 400 })
  }
}
