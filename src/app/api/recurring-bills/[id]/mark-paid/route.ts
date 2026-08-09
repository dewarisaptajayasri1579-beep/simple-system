import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { billPaidLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { bebanCodeForCategory } from "@/lib/accounting/coa-seed"

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

  // Draft -> Posted: cuma bikin Transaction + jurnal draft di sini, `lastPaidAt` BELUM
  // diupdate — baru berlaku saat draft ini di-posting (POST /api/transactions/[id]/post).
  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        accountId,
        type: "expense",
        categoryId,
        grossAmount: bill.price!,
        cost: 0,
        netAmount: bill.price!,
        description: `Pembayaran biaya berkala - ${bill.name}`,
        occurredAt: paidAt,
        refType: "recurring_bill",
        refId: bill.id,
      },
    })

    const [kasBankCoaCode] = await Promise.all([getAccountCoaCode(tx, accountId)])
    const journalEntry = await postJournalEntry(tx, {
      date: paidAt,
      description: `Pembayaran biaya berkala - ${bill.name}`,
      sourceType: "recurring_bill",
      sourceId: bill.id,
      createdBy: user.id,
      lines: billPaidLines({ kasBankCoaCode, expenseCoaCode: bebanCodeForCategory(bill.category), amount: bill.price! }),
    })
    // Link presisi ke jurnal transaksi INI (bukan cuma sourceType+sourceId, yang dipakai bareng
    // sama semua histori "Tandai Lunas" biaya berkala yang sama) — lihat mark-paid.ts.
    await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

    return { transaction, bill }
  })

  return NextResponse.json(result)
}
