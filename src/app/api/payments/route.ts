import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { generatePaymentNumber } from "@/lib/payment-number"
import { computeSplit } from "@/lib/split"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { invoicePaymentLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { markDomainPaid, markServerPaid } from "@/lib/accounting/mark-paid"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const payments = await prisma.payment.findMany({
    include: { client: true, account: true, invoicePayments: { include: { invoice: true } } },
    orderBy: { paidAt: "desc" },
  })

  return NextResponse.json(payments)
}

interface CostLinkInput {
  type: "domain" | "server"
  id: string
}

interface LineInput {
  invoiceId: string
  amount: number
  costAmount?: number
  costLink?: CostLinkInput
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const clientId = typeof body?.clientId === "string" ? body.clientId : ""
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const notes = typeof body?.notes === "string" ? body.notes : null
  const rawLines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []

  if (!clientId) return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 })
  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })

  const lines = rawLines
    .map((l) => {
      const rawLink = l.costLink
      const costLink: CostLinkInput | undefined =
        rawLink && (rawLink.type === "domain" || rawLink.type === "server") && typeof rawLink.id === "string"
          ? { type: rawLink.type, id: rawLink.id }
          : undefined
      return {
        invoiceId: typeof l.invoiceId === "string" ? l.invoiceId : "",
        amount: Number(l.amount) || 0,
        costAmount: Math.max(0, Number(l.costAmount) || 0),
        costLink,
      }
    })
    .filter((l) => l.invoiceId && l.amount > 0)

  if (lines.length === 0) return NextResponse.json({ error: "Pilih minimal 1 invoice untuk dibayar" }, { status: 400 })

  // Mengaitkan biaya ke "Bayar Domain"/"Bayar Server" langsung menandai record itu lunas +
  // posting jurnal beban — efeknya sama seperti kartu "Tandai Lunas" di Master Data, yang
  // sengaja dibatasi Owner saja. Jangan longgarkan cuma karena masuk lewat form Pelunasan.
  if (lines.some((l) => l.costLink) && user.role !== "owner") {
    return NextResponse.json({ error: "Cuma Owner yang bisa mengaitkan biaya ke Bayar Domain/Server" }, { status: 403 })
  }

  const invoiceIds = lines.map((l) => l.invoiceId)
  if (new Set(invoiceIds).size !== invoiceIds.length) {
    return NextResponse.json({ error: "Invoice tidak boleh diinput dua kali" }, { status: 400 })
  }

  const invoices = await prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, include: { payments: true } })
  if (invoices.length !== invoiceIds.length) {
    return NextResponse.json({ error: "Ada invoice yang tidak ditemukan" }, { status: 404 })
  }
  if (invoices.some((inv) => inv.clientId !== clientId)) {
    return NextResponse.json({ error: "Semua invoice harus milik client yang sama" }, { status: 400 })
  }

  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]))
  for (const line of lines) {
    const invoice = invoiceById.get(line.invoiceId)!
    const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
    const remaining = invoice.totalAmount - alreadyPaid
    if (line.amount > remaining + 0.5) {
      return NextResponse.json(
        { error: `${invoice.invoiceNumber}: jumlah bayar melebihi sisa tagihan (sisa: ${remaining})` },
        { status: 400 }
      )
    }
  }

  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })
  const totalAmount = lines.reduce((sum, l) => sum + l.amount, 0)
  const paymentNumber = await generatePaymentNumber()

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: { paymentNumber, clientId, accountId, totalAmount, notes },
    })

    const kasBankCoaCode = await getAccountCoaCode(tx, accountId)

    for (const line of lines) {
      const invoice = invoiceById.get(line.invoiceId)!
      const alreadyPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0)

      // Alokasikan HPP+PPN invoice secara proporsional ke pembayaran ini (supaya PPN & HPP tidak
      // ikut kena split walau tagihannya dicicil), lalu tambah HPP manual yang diinput staf khusus
      // untuk transaksi ini (mis. biaya kirim/admin yang baru muncul saat pelunasan).
      const rawPortion = invoice.totalAmount > 0 ? ((invoice.totalCost + invoice.ppnAmount) * line.amount) / invoice.totalAmount : 0
      const nonRevenuePortion = Math.round(rawPortion) + Math.round(line.costAmount)
      const split = computeSplit(line.amount, nonRevenuePortion, {
        operasionalPct: settings.operasionalPct,
        direksiPct: settings.direksiPct,
        bonusPct: settings.bonusPct,
      })

      const transaction = await tx.transaction.create({
        data: {
          accountId,
          type: "income",
          grossAmount: line.amount,
          cost: nonRevenuePortion,
          netAmount: split.netAmount,
          splitOperasionalPct: settings.operasionalPct,
          splitDireksiPct: settings.direksiPct,
          splitBonusPct: settings.bonusPct,
          operasionalAmount: split.operasionalAmount,
          direksiAmount: split.direksiAmount,
          bonusAmount: split.bonusAmount,
          description: `Pelunasan ${paymentNumber} - invoice ${invoice.invoiceNumber}`,
        },
      })

      await tx.invoicePayment.create({
        data: {
          invoiceId: line.invoiceId,
          accountId,
          paymentId: payment.id,
          amount: line.amount,
          costAmount: line.costAmount,
          notes,
          transactionId: transaction.id,
        },
      })

      const newTotalPaid = alreadyPaid + line.amount
      const newStatus = newTotalPaid >= invoice.totalAmount - 0.5 ? "paid" : "partial"
      await tx.invoice.update({ where: { id: line.invoiceId }, data: { status: newStatus } })

      await postJournalEntry(tx, {
        date: new Date(),
        description: `Pelunasan ${paymentNumber} - invoice ${invoice.invoiceNumber}`,
        sourceType: "invoice_payment",
        sourceId: transaction.id,
        createdBy: user.id,
        lines: invoicePaymentLines({ kasBankCoaCode, amount: line.amount }),
      })

      // Biaya yang dikaitkan ke domain/server langsung dibayar dari kas yang sama dengan
      // yang baru saja menerima pelunasan ini — bukan cuma angka pengurang split, tapi
      // benaran menandai domain/server itu lunas (update lastPaidAt + jurnal beban),
      // persis efeknya kalau dipakai lewat kartu "Bayar Domain"/"Bayar Server" di Keuangan.
      if (line.costLink?.type === "domain") {
        await markDomainPaid(tx, { domainId: line.costLink.id, accountId, paidAt: new Date(), createdBy: user.id })
      } else if (line.costLink?.type === "server") {
        await markServerPaid(tx, { serverId: line.costLink.id, accountId, paidAt: new Date(), createdBy: user.id })
      }
    }

    return payment
  })

  return NextResponse.json(result, { status: 201 })
}
