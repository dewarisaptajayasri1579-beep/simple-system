import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { kasbonDisbursementLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { generateTransactionNumber } from "@/lib/transaction-number"

/** Daftar Kasbon + sisa (outstanding) tiap kasbon — dihitung dari SEMUA Transaction posted
 *  (refType="kasbon") sekaligus lewat 1 groupBy, bukan query per baris di loop (lihat aturan
 *  N+1 di CLAUDE.md). */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const kasbons = await prisma.kasbon.findMany({
    include: { user: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  })

  const kasbonIds = kasbons.map((k) => k.id)
  const sums = kasbonIds.length
    ? await prisma.transaction.groupBy({
        by: ["refId", "type"],
        where: { refType: "kasbon", refId: { in: kasbonIds }, postStatus: "posted" },
        _sum: { grossAmount: true },
      })
    : []

  const disbursedByKasbonId = new Map<string, number>()
  const repaidByKasbonId = new Map<string, number>()
  for (const row of sums) {
    if (!row.refId) continue
    const map = row.type === "expense" ? disbursedByKasbonId : repaidByKasbonId
    map.set(row.refId, (map.get(row.refId) ?? 0) + (row._sum.grossAmount ?? 0))
  }

  return NextResponse.json(
    kasbons.map((k) => {
      const disbursed = disbursedByKasbonId.get(k.id) ?? 0
      const repaid = repaidByKasbonId.get(k.id) ?? 0
      return { ...k, disbursed, outstanding: disbursed - repaid }
    })
  )
}

/** Beri Kasbon ke karyawan (User) — Owner/Direktur saja, sama gate dengan hub Keuangan. Bikin
 *  Kasbon (status "outstanding") + 1 Transaction pencairan (expense, refType="kasbon") + jurnal
 *  draft debit Piutang Karyawan / kredit Kas-Bank. Ikut alur draft->posted umum (posting lewat
 *  POST /api/transactions/[id]/post yang sudah ada). */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "direktur") {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa memberi Kasbon" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const userId = typeof body?.userId === "string" ? body.userId : ""
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const amount = Number(body?.amount) || 0
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const occurredAt = typeof body?.occurredAt === "string" && body.occurredAt ? new Date(body.occurredAt) : new Date()

  if (!userId) return NextResponse.json({ error: "Karyawan penerima wajib dipilih" }, { status: 400 })
  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal kasbon tidak valid" }, { status: 400 })

  const recipient = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  if (!recipient) return NextResponse.json({ error: "Karyawan penerima tidak ditemukan" }, { status: 404 })

  try {
    const created = await prisma.$transaction(async (tx) => {
      const kasbon = await tx.kasbon.create({
        data: { userId, amount, description: description || null, occurredAt, createdById: user.id },
      })

      const transaction = await tx.transaction.create({
        data: {
          transactionNumber: await generateTransactionNumber(tx, "expense"),
          accountId,
          type: "expense",
          grossAmount: amount,
          cost: 0,
          netAmount: amount,
          description: description || `Kasbon - ${recipient.name}`,
          occurredAt,
          refType: "kasbon",
          refId: kasbon.id,
          createdById: user.id,
        },
      })

      const kasBankCoaCode = await getAccountCoaCode(tx, accountId)
      const journalEntry = await postJournalEntry(tx, {
        date: occurredAt,
        description: `Kasbon - ${recipient.name}`,
        sourceType: "kasbon",
        sourceId: kasbon.id,
        createdBy: user.id,
        lines: kasbonDisbursementLines({ kasBankCoaCode, amount }),
      })
      await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

      return { kasbon, transaction }
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan Kasbon" }, { status: 400 })
  }
}
