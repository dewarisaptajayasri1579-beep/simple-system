import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"

/** Ganti Akun/Jumlah 1 baris Biaya (domain/server yang dikaitkan) di Payment yang masih
 *  DRAFT. Sama seperti pengaitan biaya saat Pelunasan dibuat, cuma Owner yang boleh —
 *  baris ini efeknya sama dengan "Bayar Domain/Server", jangan longgarkan cuma karena
 *  diedit lewat sini. Sinkronkan 2 baris jurnal draft (beban & kas/bank). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; transactionId: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa mengubah biaya ini" }, { status: 403 })

  const { id: paymentId, transactionId } = await params
  const body = await request.json().catch(() => null)
  const hasAccount = typeof body?.accountId === "string" && body.accountId
  const hasAmount = body?.amount !== undefined
  const amount = hasAmount ? Number(body.amount) : undefined
  if (hasAmount && (!Number.isFinite(amount) || (amount as number) <= 0)) {
    return NextResponse.json({ error: "Jumlah biaya wajib diisi" }, { status: 400 })
  }
  if (!hasAccount && !hasAmount) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") {
    return NextResponse.json({ error: "Pembayaran yang sudah diposting/dibatalkan tidak bisa diubah" }, { status: 400 })
  }

  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } })
  if (!transaction || transaction.paymentId !== paymentId || !["domain", "server", "maintenance"].includes(transaction.refType ?? "")) {
    return NextResponse.json({ error: "Baris biaya tidak ditemukan" }, { status: 404 })
  }

  let newAccount = null as Awaited<ReturnType<typeof prisma.account.findUnique>> | null
  if (hasAccount) {
    newAccount = await prisma.account.findUnique({ where: { id: body.accountId } })
    if (!newAccount) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 })
  }
  const newAmount = hasAmount ? (amount as number) : transaction.grossAmount

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({
      where: { id: transactionId },
      data: { grossAmount: newAmount, netAmount: newAmount, ...(newAccount ? { accountId: newAccount.id } : {}) },
    })

    if (transaction.journalEntryId) {
      const entry = await tx.journalEntry.findUnique({ where: { id: transaction.journalEntryId } })
      if (entry?.postStatus === "draft") {
        if (hasAmount) {
          await tx.journalLine.updateMany({ where: { journalEntryId: entry.id, debit: { gt: 0 } }, data: { debit: newAmount } })
          await tx.journalLine.updateMany({ where: { journalEntryId: entry.id, credit: { gt: 0 } }, data: { credit: newAmount } })
        }
        if (newAccount) {
          const newCoaCode = await getAccountCoaCode(tx, newAccount.id)
          const newCoaAccount = await tx.chartOfAccount.findUnique({ where: { code: newCoaCode } })
          if (newCoaAccount) {
            await tx.journalLine.updateMany({ where: { journalEntryId: entry.id, credit: { gt: 0 } }, data: { accountId: newCoaAccount.id } })
          }
        }
      }
    }

    return updated
  })

  return NextResponse.json(result)
}
