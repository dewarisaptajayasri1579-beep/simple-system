import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { kasbonRepaymentLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { generateTransactionNumber } from "@/lib/transaction-number"

/** Bayar cicilan/lunasi Kasbon — boleh dipanggil berkali-kali untuk 1 Kasbon yang sama sampai
 *  outstanding-nya 0 (lihat finalizeTransactionPosting utk recompute status "lunas"). Bikin 1
 *  Transaction pemasukan (income, refType="kasbon") + jurnal draft debit Kas-Bank / kredit
 *  Piutang Karyawan, sama alur draft->posted seperti pencairannya. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "direktur") {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa mencatat pelunasan Kasbon" }, { status: 403 })
  }

  const { id } = await params
  const kasbon = await prisma.kasbon.findUnique({ where: { id }, include: { user: { select: { name: true } } } })
  if (!kasbon) return NextResponse.json({ error: "Kasbon tidak ditemukan" }, { status: 404 })
  if (kasbon.status === "lunas") return NextResponse.json({ error: "Kasbon ini sudah lunas" }, { status: 400 })

  const body = await request.json().catch(() => null)
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const amount = Number(body?.amount) || 0
  const occurredAt = typeof body?.occurredAt === "string" && body.occurredAt ? new Date(body.occurredAt) : new Date()

  if (!accountId) return NextResponse.json({ error: "Akun kas/bank tujuan wajib dipilih" }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal pelunasan tidak valid" }, { status: 400 })

  const sums = await prisma.transaction.groupBy({
    by: ["type"],
    where: { refType: "kasbon", refId: id, postStatus: "posted" },
    _sum: { grossAmount: true },
  })
  const disbursed = sums.find((s) => s.type === "expense")?._sum.grossAmount ?? 0
  const repaid = sums.find((s) => s.type === "income")?._sum.grossAmount ?? 0
  const outstanding = disbursed - repaid

  if (amount > outstanding + 0.5) {
    return NextResponse.json({ error: `Nominal melebihi sisa Kasbon (Rp ${outstanding.toLocaleString("id-ID")})` }, { status: 400 })
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: await generateTransactionNumber(tx, "income"),
          accountId,
          type: "income",
          grossAmount: amount,
          cost: 0,
          netAmount: amount,
          description: `Pelunasan kasbon - ${kasbon.user.name}`,
          occurredAt,
          refType: "kasbon",
          refId: kasbon.id,
          createdById: user.id,
        },
      })

      const kasBankCoaCode = await getAccountCoaCode(tx, accountId)
      const journalEntry = await postJournalEntry(tx, {
        date: occurredAt,
        description: `Pelunasan kasbon - ${kasbon.user.name}`,
        sourceType: "kasbon",
        sourceId: kasbon.id,
        createdBy: user.id,
        lines: kasbonRepaymentLines({ kasBankCoaCode, amount }),
      })
      await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

      return { transaction }
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan pelunasan Kasbon" }, { status: 400 })
  }
}
