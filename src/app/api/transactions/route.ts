import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeSplit } from "@/lib/split"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { manualIncomeLines, manualExpenseLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode, getCategoryCoaCode } from "@/lib/accounting/coa-lookup"
import { generateTransactionNumber } from "@/lib/transaction-number"

export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get("type")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const paymentId = searchParams.get("paymentId")
  const refType = searchParams.get("refType")
  const refId = searchParams.get("refId")
  const postStatus = searchParams.get("postStatus")
  // ?take= opsional — DraftTransactionsPanel (dan siapa pun yang cuma butuh N baris terbaru,
  // bukan seluruh histori) kirim ini biar tidak nge-load semua Transaction yang pernah dibuat.
  const take = Number(searchParams.get("take")) || undefined
  // ?excludePaymentLinked=true — DraftTransactionsPanel juga tidak menampilkan baris yang jadi
  // bagian dari 1 Payment (itu dikelola dari menu Pembayaran sendiri); dipush ke query di sini
  // (bukan filter di JS setelah fetch) supaya `take` di atas tetap presisi N baris yang benar-
  // benar ditampilkan, bukan N baris sebelum difilter.
  const excludePaymentLinked = searchParams.get("excludePaymentLinked") === "true"

  const transactions = await prisma.transaction.findMany({
    where: {
      type: type || undefined,
      paymentId: paymentId || undefined,
      refType: refType || undefined,
      refId: refId || undefined,
      postStatus: postStatus || undefined,
      occurredAt: from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined,
      ...(excludePaymentLinked ? { paymentId: null, invoicePayment: { is: null } } : {}),
    },
    include: { account: true, category: true, invoicePayment: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take,
  })

  return NextResponse.json(transactions)
}

/** Input manual — pengeluaran kantor atau pemasukan di luar invoice (mis. hasil jual barang
 *  bekas, dsb). Pemasukan lewat invoice/pelunasan bertahap otomatis lewat
 *  /api/invoices/[id]/payments, tidak lewat sini. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const type = body?.type === "expense" ? "expense" : "income"
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const grossAmount = Number(body?.grossAmount)
  const categoryId = typeof body?.categoryId === "string" && body.categoryId ? body.categoryId : null

  if (!accountId) return NextResponse.json({ error: "Akun wajib dipilih" }, { status: 400 })
  if (!grossAmount || grossAmount <= 0) return NextResponse.json({ error: "Jumlah tidak valid" }, { status: 400 })

  if (type === "expense") {
    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          transactionNumber: await generateTransactionNumber(tx, "expense"),
          accountId,
          type: "expense",
          categoryId,
          grossAmount,
          cost: 0,
          netAmount: grossAmount,
          description: body?.description || null,
          occurredAt: body?.occurredAt ? new Date(body.occurredAt) : undefined,
          createdById: user.id,
        },
      })

      const [kasBankCoaCode, expenseCoaCode] = await Promise.all([
        getAccountCoaCode(tx, accountId),
        getCategoryCoaCode(tx, categoryId, "expense"),
      ])
      await postJournalEntry(tx, {
        date: created.occurredAt,
        description: created.description || "Pengeluaran manual",
        sourceType: "transaction",
        sourceId: created.id,
        createdBy: user.id,
        lines: manualExpenseLines({ kasBankCoaCode, expenseCoaCode, grossAmount }),
      })

      return created
    })
    return NextResponse.json(transaction, { status: 201 })
  }

  const cost = Number(body?.cost) || 0
  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })
  const split = computeSplit(grossAmount, cost, {
    operasionalPct: settings.operasionalPct,
    direksiPct: settings.direksiPct,
    bonusPct: settings.bonusPct,
  })

  const transaction = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        transactionNumber: await generateTransactionNumber(tx, "income"),
        accountId,
        type: "income",
        categoryId,
        grossAmount,
        cost,
        netAmount: split.netAmount,
        splitOperasionalPct: settings.operasionalPct,
        splitDireksiPct: settings.direksiPct,
        splitBonusPct: settings.bonusPct,
        operasionalAmount: split.operasionalAmount,
        direksiAmount: split.direksiAmount,
        bonusAmount: split.bonusAmount,
        description: body?.description || null,
        occurredAt: body?.occurredAt ? new Date(body.occurredAt) : undefined,
        createdById: user.id,
      },
    })

    const [kasBankCoaCode, revenueCoaCode] = await Promise.all([
      getAccountCoaCode(tx, accountId),
      getCategoryCoaCode(tx, categoryId, "income"),
    ])
    await postJournalEntry(tx, {
      date: created.occurredAt,
      description: created.description || "Pemasukan manual",
      sourceType: "transaction",
      sourceId: created.id,
      createdBy: user.id,
      lines: manualIncomeLines({ kasBankCoaCode, revenueCoaCode, grossAmount, cost }),
    })

    return created
  })
  return NextResponse.json(transaction, { status: 201 })
}
