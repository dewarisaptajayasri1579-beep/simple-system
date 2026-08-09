import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { markRecurringBillPaid } from "@/lib/accounting/mark-paid"

/** "Tandai Lunas" — beda dari PATCH generik: ini merekam pembayaran sungguhan (bikin
 *  Transaction cash-basis + jurnal akrual), bukan cuma koreksi tanggal. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa kelola master data" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const categoryId = typeof body?.categoryId === "string" && body.categoryId ? body.categoryId : null
  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })

  const bill = await prisma.recurringBill.findUnique({ where: { id } })
  if (!bill) return NextResponse.json({ error: "Biaya berkala tidak ditemukan" }, { status: 404 })
  if (!bill.price || bill.price <= 0) return NextResponse.json({ error: "Biaya berkala ini belum punya nominal" }, { status: 400 })

  const paidAt = body?.paidAt ? new Date(body.paidAt) : new Date()

  try {
    // Draft -> Posted: cuma bikin Transaction + jurnal draft di sini, `lastPaidAt` BELUM
    // diupdate — baru berlaku saat draft ini di-posting (POST /api/transactions/[id]/post).
    const result = await prisma.$transaction((tx) =>
      markRecurringBillPaid(tx, { billId: id, accountId, amount: bill.price!, paidAt, createdBy: user.id, categoryId })
    )
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan pembayaran" }, { status: 400 })
  }
}
