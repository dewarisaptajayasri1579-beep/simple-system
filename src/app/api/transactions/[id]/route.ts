import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry, type TxClient } from "@/lib/accounting/post-journal"
import { manualExpenseLines, billPaidLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode, getCategoryCoaCode } from "@/lib/accounting/coa-lookup"
import { COA_CODE, bebanCodeForCategory } from "@/lib/accounting/coa-seed"

/** refType yang aman diedit inline (bukan cuma hapus+input ulang) — semuanya masih draft di
 *  titik ini jadi lastPaidAt/expiryDate/dsb belum ke-update sama sekali (baru kesentuh pas
 *  posting, lihat finalizeTransactionPosting), jadi ubah nominal/keterangan sebelum posting
 *  aman, tidak menyentuh tracking field apa pun. */
const EDITABLE_REF_TYPES = new Set(["domain", "server", "maintenance", "recurring_bill"])

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transaction = await prisma.transaction.findUnique({ where: { id }, include: { account: true, category: true } })
  if (!transaction) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 })
  return NextResponse.json(transaction)
}

/** Edit Transaction (Kas Keluar) yang masih draft — Keterangan/Akun/Kategori/Nominal. Berlaku
 *  buat pengeluaran manual DAN baris "Bayar Domain/Server/Maintenance/Biaya Berkala" (refType
 *  terisi) — aman diedit inline selama masih draft karena lastPaidAt/expiryDate/dsb belum
 *  ke-update sama sekali di titik ini (baru kesentuh pas posting, lihat
 *  finalizeTransactionPosting). Kategori-nya sendiri TIDAK bisa diganti buat baris ref-based
 *  (akun Beban-nya ngikut item terkait, bukan pilihan bebas). Pemasukan manual & transaksi
 *  bagian dari Payment tetap TIDAK bisa diedit di sini (splitnya ikut dihitung ulang dari %
 *  settings saat dibuat / dikelola lewat menu Pembayaran) — hapus lalu input ulang (lihat
 *  DELETE di bawah). Jurnal draft yang menempel ikut dihapus & dibuat ulang supaya tetap
 *  sinkron dengan akun/nominal barunya. */
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
  if (transaction.type !== "expense" || (transaction.refType && !EDITABLE_REF_TYPES.has(transaction.refType))) {
    return NextResponse.json({ error: "Transaksi ini tidak bisa diedit — hapus lalu input ulang" }, { status: 400 })
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

  // Baris ref-based: akun Beban-nya tetap (ngikut Domain/Server/Maintenance/kategori Biaya
  // Berkala terkait, TIDAK dari `categoryId` body) — cuma manual yang boleh ganti kategori bebas.
  const resolveExpenseCoaCode = async (tx: TxClient) => {
    if (!transaction.refType) return getCategoryCoaCode(tx, categoryId, "expense")
    if (transaction.refType === "domain") return COA_CODE.bebanDomain
    if (transaction.refType === "server") return COA_CODE.bebanServerHosting
    if (transaction.refType === "maintenance") return COA_CODE.bebanMaintenance
    const bill = await tx.recurringBill.findUnique({ where: { id: transaction.refId! } })
    if (!bill) throw new Error("Biaya berkala terkait tidak ditemukan")
    return bebanCodeForCategory(bill.category)
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.journalEntry.deleteMany({ where: journalWhere })

      const saved = await tx.transaction.update({
        where: { id },
        data: {
          accountId,
          categoryId: transaction.refType ? transaction.categoryId : categoryId,
          description: description || null,
          grossAmount,
          netAmount: grossAmount,
        },
      })

      const [kasBankCoaCode, expenseCoaCode] = await Promise.all([getAccountCoaCode(tx, accountId), resolveExpenseCoaCode(tx)])
      const journalEntry = await postJournalEntry(tx, {
        date: saved.occurredAt,
        description: saved.description || "Pengeluaran manual",
        sourceType: "transaction",
        sourceId: saved.id,
        createdBy: user.id,
        lines: transaction.refType
          ? billPaidLines({ kasBankCoaCode, expenseCoaCode, amount: grossAmount })
          : manualExpenseLines({ kasBankCoaCode, expenseCoaCode, grossAmount }),
      })

      return tx.transaction.update({
        where: { id: saved.id },
        data: { journalEntryId: journalEntry.id },
        include: { account: true, category: true },
      })
    })

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan perubahan" }, { status: 400 })
  }
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
