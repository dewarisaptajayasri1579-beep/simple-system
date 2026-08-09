import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { markDomainPaid, markServerPaid, markMaintenancePaid } from "@/lib/accounting/mark-paid"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { manualExpenseLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode, getCategoryCoaCode } from "@/lib/accounting/coa-lookup"

/** Tambah 1 baris Biaya baru ke Payment yang masih DRAFT — Bayar Domain/Server/Maintenance
 *  (lewat markDomainPaid/dst, sama jalurnya dengan Kas Keluar & form Pelunasan), ATAU Biaya
 *  Manual (kategori bebas, tidak terkait item master data apa pun). Dipakai kalau staf lupa
 *  kaitkan biaya waktu bikin Pelunasan, atau memang mau bayar lebih dari 1 item sekaligus dari
 *  kas yang sama. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa menambah biaya ini" }, { status: 403 })

  const { id: paymentId } = await params
  const body = await request.json().catch(() => null)
  const kind =
    body?.kind === "server" ? "server" : body?.kind === "maintenance" ? "maintenance" : body?.kind === "manual" ? "manual" : "domain"
  const itemId = typeof body?.itemId === "string" ? body.itemId : ""
  const amount = Number(body?.amount)
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const categoryId = typeof body?.categoryId === "string" && body.categoryId ? body.categoryId : null

  if (!amount || amount <= 0) return NextResponse.json({ error: "Jumlah biaya wajib diisi" }, { status: 400 })
  if (kind === "manual") {
    if (!description) return NextResponse.json({ error: "Keterangan wajib diisi" }, { status: 400 })
  } else if (!itemId) {
    return NextResponse.json({ error: `Pilih ${kind === "domain" ? "domain" : kind === "server" ? "server" : "maintenance"}-nya dulu` }, { status: 400 })
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") {
    return NextResponse.json({ error: "Pembayaran yang sudah diposting/dibatalkan tidak bisa diubah" }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (kind === "domain") {
        return markDomainPaid(tx, { domainId: itemId, accountId: payment.accountId, amount, paidAt: payment.paidAt, createdBy: user.id, paymentId })
      }
      if (kind === "server") {
        return markServerPaid(tx, { serverId: itemId, accountId: payment.accountId, amount, paidAt: payment.paidAt, createdBy: user.id, paymentId })
      }
      if (kind === "maintenance") {
        return markMaintenancePaid(tx, { maintenanceId: itemId, accountId: payment.accountId, amount, paidAt: payment.paidAt, createdBy: user.id, paymentId })
      }

      // Biaya Manual — Transaction expense biasa (tanpa refType), dikaitkan cuma lewat
      // paymentId, sama seperti baris pendapatan invoice-nya.
      const transaction = await tx.transaction.create({
        data: {
          accountId: payment.accountId,
          type: "expense",
          categoryId,
          grossAmount: amount,
          cost: 0,
          netAmount: amount,
          description,
          occurredAt: payment.paidAt,
          paymentId,
        },
      })
      const [kasBankCoaCode, expenseCoaCode] = await Promise.all([
        getAccountCoaCode(tx, payment.accountId),
        getCategoryCoaCode(tx, categoryId, "expense"),
      ])
      const journalEntry = await postJournalEntry(tx, {
        date: payment.paidAt,
        description,
        sourceType: "transaction",
        sourceId: transaction.id,
        createdBy: user.id,
        lines: manualExpenseLines({ kasBankCoaCode, expenseCoaCode, grossAmount: amount }),
      })
      await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })
      return { transaction }
    })
    return NextResponse.json({ ok: true, transactionId: result.transaction.id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menambah biaya" }, { status: 400 })
  }
}
