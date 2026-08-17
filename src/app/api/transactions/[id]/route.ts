import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { manualExpenseLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode, getCategoryCoaCode } from "@/lib/accounting/coa-lookup"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { account: true, category: true } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  return NextResponse.json(transaction)
}

/** Edit Transaction manual (Kas Keluar) yang masih draft — Keterangan/Akun/Kategori/Nominal.
 *  Dibatasi ke pengeluaran manual (type "expense", tanpa refType, bukan bagian dari Payment)
 *  karena baris "Bayar Domain/Server/Maintenance/Biaya Berkala" dan pemasukan manual (splitnya
 *  ikut dihitung ulang dari % settings saat dibuat) lebih aman diedit lewat hapus+input ulang
 *  (lihat DELETE di bawah) daripada disamakan logikanya di sini. Jurnal draft yang menempel
 *  ikut dihapus & dibuat ulang supaya tetap sinkron dengan akun/nominal barunya. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  if (transaction.postStatus !== "draft") {
    return NextResponse.json({ error: "Transaksi yang sudah diposting/dibatalkan tidak bisa diedit" }, { status: 400 })
  }
  if (transaction.paymentId) {
    return NextResponse.json({ error: "Transaksi ini bagian dari Pembayaran — edit lewat menu Pembayaran" }, { status: 400 })
  }
  if (transaction.type !== "expense" || transaction.refType) {
    return NextResponse.json({ error: "Cuma pengeluaran manual (Kas Keluar) yang bisa diedit — hapus lalu input ulang" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const categoryId = typeof body?.categoryId === "string" && body.categoryId ? body.categoryId : null
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const grossAmount = Number(body?.grossAmount)

  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })
  if (!grossAmount || grossAmount <= 0) return NextResponse.json({ error: "Nominal tidak valid" }, { status: 400 })

  const journalWhere = transaction.journalEntryId
    ? { id: transaction.journalEntryId, postStatus: "draft" as const }
    : { sourceType: "transaction" as const, sourceId: transaction.id, postStatus: "draft" as const }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: journalWhere })

    const saved = await tx.transaction.update({
      where: { id },
      data: { accountId, categoryId, description: description || null, grossAmount, netAmount: grossAmount },
    })

    const [kasBankCoaCode, expenseCoaCode] = await Promise.all([
      getAccountCoaCode(tx, accountId),
      getCategoryCoaCode(tx, categoryId, "expense"),
    ])
    const journalEntry = await postJournalEntry(tx, {
      date: saved.occurredAt,
      description: saved.description || "Pengeluaran manual",
      sourceType: "transaction",
      sourceId: saved.id,
      createdBy: user.id,
      lines: manualExpenseLines({ kasBankCoaCode, expenseCoaCode, grossAmount }),
    })

    return tx.transaction.update({
      where: { id: saved.id },
      data: { journalEntryId: journalEntry.id },
      include: { account: true, category: true },
    })
  })

  return NextResponse.json(updated)
}

/** Hapus Transaction DRAFT (belum diposting) — dipakai untuk "edit": hapus draft, input ulang
 *  (Input Pemasukan/Pengeluaran manual, atau draft "Bayar Server/Domain"/"Tandai Lunas"). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { invoicePayment: true } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  if (transaction.postStatus !== "draft") {
    return NextResponse.json({ error: "Transaksi yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  }
  if (transaction.invoicePayment) {
    return NextResponse.json({ error: "Transaksi ini bagian dari Pembayaran — hapus lewat menu Pembayaran" }, { status: 400 })
  }

  const journalWhere = transaction.journalEntryId
    ? { id: transaction.journalEntryId, postStatus: "draft" as const }
    : {
        sourceType: transaction.refType ?? "transaction",
        sourceId: transaction.refType && transaction.refId ? transaction.refId : transaction.id,
        postStatus: "draft" as const,
      }

  await prisma.$transaction([
    prisma.journalEntry.deleteMany({ where: journalWhere }),
    prisma.transaction.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
