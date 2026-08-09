import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"

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

/** Ganti "Masuk ke Akun" Payment yang masih DRAFT — dipakai inline-edit di halaman detail
 *  supaya tidak perlu hapus+input ulang cuma buat salah pilih akun kas/bank. Ikut men-cascade
 *  accountId ke semua Transaction (termasuk biaya domain/server yang dikaitkan, karena
 *  dibayar dari kas yang sama) + InvoicePayment, dan menggeser baris jurnal draft yang tadinya
 *  nunjuk ke akun kas/bank lama supaya tetap balance & sinkron dengan akun barunya. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })

  const payment = await prisma.payment.findUnique({ where: { id } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") {
    return NextResponse.json({ error: "Pembayaran yang sudah diposting/dibatalkan tidak bisa diubah" }, { status: 400 })
  }

  const newAccount = await prisma.account.findUnique({ where: { id: accountId } })
  if (!newAccount) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 })

  if (accountId === payment.accountId) return NextResponse.json(payment)

  const result = await prisma.$transaction(async (tx) => {
    const [oldCoaCode, newCoaCode] = await Promise.all([
      getAccountCoaCode(tx, payment.accountId),
      getAccountCoaCode(tx, accountId),
    ])
    const [oldCoaAccount, newCoaAccount] = await Promise.all([
      tx.chartOfAccount.findUnique({ where: { code: oldCoaCode } }),
      tx.chartOfAccount.findUnique({ where: { code: newCoaCode } }),
    ])

    const updated = await tx.payment.update({ where: { id }, data: { accountId } })
    await tx.invoicePayment.updateMany({ where: { paymentId: id }, data: { accountId } })

    const transactions = await tx.transaction.findMany({ where: { paymentId: id } })
    await tx.transaction.updateMany({ where: { paymentId: id }, data: { accountId } })

    if (oldCoaAccount && newCoaAccount && oldCoaAccount.id !== newCoaAccount.id) {
      const journalEntryIds = transactions.map((t) => t.journalEntryId).filter((jid): jid is string => !!jid)
      for (const journalEntryId of journalEntryIds) {
        const entry = await tx.journalEntry.findUnique({ where: { id: journalEntryId } })
        if (entry?.postStatus !== "draft") continue // sudah diposting/dibatalkan, jangan diutak-atik
        await tx.journalLine.updateMany({
          where: { journalEntryId, accountId: oldCoaAccount.id },
          data: { accountId: newCoaAccount.id },
        })
      }
    }

    return updated
  })

  return NextResponse.json(result)
}

/** Hapus Payment DRAFT (belum diposting) — dipakai untuk "edit": hapus draft, input ulang
 *  lewat form Pelunasan. Ikut menghapus InvoicePayment, Transaction, dan jurnal draft terkait
 *  (termasuk costLink Bayar Domain/Server yang dikaitkan ke payment ini, kalau ada). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const payment = await prisma.payment.findUnique({ where: { id }, include: { invoicePayments: true } })
  if (!payment) return NextResponse.json({ error: "Pembayaran tidak ditemukan" }, { status: 404 })
  if (payment.postStatus !== "draft") {
    return NextResponse.json({ error: "Pembayaran yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    const transactions = await tx.transaction.findMany({ where: { paymentId: id } })
    for (const t of transactions) {
      if (t.journalEntryId) {
        await tx.journalEntry.deleteMany({ where: { id: t.journalEntryId, postStatus: "draft" } })
      } else {
        const sourceType = t.refType ?? "invoice_payment"
        const sourceId = t.refType && t.refId ? t.refId : t.id
        await tx.journalEntry.deleteMany({ where: { sourceType, sourceId, postStatus: "draft" } })
      }
    }
    await tx.invoicePayment.deleteMany({ where: { paymentId: id } })
    await tx.transaction.deleteMany({ where: { paymentId: id } })
    await tx.payment.delete({ where: { id } })
  })

  return NextResponse.json({ ok: true })
}
