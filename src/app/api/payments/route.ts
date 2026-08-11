import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { generatePaymentNumber } from "@/lib/payment-number"
import { computeSplit } from "@/lib/split"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { invoicePaymentLines, ppnSettlementLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { revenueCoaCodeForInvoice } from "@/lib/accounting/coa-seed"
import { markDomainPaid, markServerPaid } from "@/lib/accounting/mark-paid"
import { generateTransactionNumber } from "@/lib/transaction-number"

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
  const paidAt = typeof body?.paidAt === "string" && body.paidAt ? new Date(body.paidAt) : new Date()
  const notes = typeof body?.notes === "string" ? body.notes : null
  const rawLines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []
  const ppnSettlementAccountId = typeof body?.ppnSettlementAccountId === "string" && body.ppnSettlementAccountId ? body.ppnSettlementAccountId : null

  if (!clientId) return NextResponse.json({ error: "Client wajib dipilih" }, { status: 400 })
  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })

  // Setor PPN Keluaran sekaligus (opsional) — sama seperti kaitkan biaya ke Bayar Domain/Server,
  // ini langsung menjurnal & mengeluarkan kas beneran, jadi dibatasi Owner saja.
  if (ppnSettlementAccountId && user.role !== "owner") {
    return NextResponse.json({ error: "Cuma Owner yang bisa setor PPN sekaligus" }, { status: 403 })
  }
  if (ppnSettlementAccountId) {
    const settlementAccount = await prisma.account.findUnique({ where: { id: ppnSettlementAccountId } })
    if (!settlementAccount) return NextResponse.json({ error: "Akun setor PPN tidak ditemukan" }, { status: 404 })
  }

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

  // Biaya (HPP) domain/server yang dikaitkan wajib diisi manual — BUKAN diambil dari harga
  // jual domain/server (itu harga ke client, beda dengan HPP/biaya modalnya).
  const missingCostAmount = lines.find((l) => l.costLink && l.costAmount <= 0)
  if (missingCostAmount) {
    return NextResponse.json({ error: "Isi dulu Biaya (HPP) untuk baris yang dikaitkan ke Bayar Domain/Server" }, { status: 400 })
  }

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

  // Cuma invoice yang sudah posted yang boleh dibayar (draft belum dianggap piutang resmi).
  // `payments` yang dihitung juga cuma yang posted (atau baris migrasi lama tanpa Payment
  // sama sekali) — payment draft milik invoice ini belum mengurangi sisa tagihan.
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds }, postStatus: "posted" },
    include: { payments: { where: { OR: [{ paymentId: null }, { payment: { is: { postStatus: "posted" } } }] } } },
  })
  if (invoices.length !== invoiceIds.length) {
    return NextResponse.json({ error: "Ada invoice yang tidak ditemukan atau belum diposting" }, { status: 404 })
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
      data: { paymentNumber, clientId, accountId, totalAmount, notes, paidAt },
    })

    const kasBankCoaCode = await getAccountCoaCode(tx, accountId)
    let totalPpnPortion = 0

    for (const line of lines) {
      const invoice = invoiceById.get(line.invoiceId)!

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
          transactionNumber: await generateTransactionNumber(tx, "income"),
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
          paymentId: payment.id,
          occurredAt: paidAt,
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
          paidAt,
        },
      })

      // Invoice.status (unpaid/partial/paid) BELUM diupdate di sini — payment ini masih draft,
      // sisa tagihan invoice baru benar-benar berkurang saat payment ini di-posting (lihat
      // POST /api/payments/[id]/post).

      // Tahap 3 SLA tindak-lanjut tagihan (lihat sop.txt/billing-follow-up.ts) — "sampai
      // diinput Pembayaran" berarti begitu baris pembayaran ini diinput (bukan menunggu
      // posted), bukan menunggu invoice-nya lunas total (bisa dicicil).
      await tx.billingFollowUp.updateMany({
        where: { invoiceId: line.invoiceId, paidRecordedAt: null },
        data: { paidRecordedAt: paidAt, paidRecordedById: user.id },
      })

      // Cash-basis (aturan.txt: "Piutang hanya catatan, Pendapatan diakui setelah ada uang
      // masuk") — Pendapatan & PPN baru diakui SEKARANG, proporsional terhadap porsi invoice
      // yang baru dibayar ini (sama pola dengan alokasi HPP proporsional di atas). Akun
      // Pendapatannya di-resolve per invoice (Domain/Server/Maintenance/Project kalau
      // dikaitkan, fallback Pendapatan Jasa untuk invoice manual biasa).
      // HPP invoice (unitCost baris invoice, BUKAN line.costAmount manual — itu sudah
      // dijurnal terpisah lewat markDomainPaid/markServerPaid/markMaintenancePaid kalau
      // dikaitkan) juga baru diakui SEKARANG, proporsional — konsisten dengan Pendapatan/PPN.
      const ppnPortion = invoice.totalAmount > 0 ? Math.round((invoice.ppnAmount * line.amount) / invoice.totalAmount) : 0
      const hppPortion = invoice.totalAmount > 0 ? Math.round((invoice.totalCost * line.amount) / invoice.totalAmount) : 0
      const revenuePortion = line.amount - ppnPortion
      totalPpnPortion += ppnPortion
      const journalEntry = await postJournalEntry(tx, {
        date: paidAt,
        description: `Pelunasan ${paymentNumber} - invoice ${invoice.invoiceNumber}`,
        sourceType: "invoice_payment",
        sourceId: transaction.id,
        createdBy: user.id,
        lines: invoicePaymentLines({
          kasBankCoaCode,
          amount: line.amount,
          revenueCoaCode: revenueCoaCodeForInvoice(invoice),
          revenueAmount: revenuePortion,
          ppnAmount: ppnPortion,
          hppAmount: hppPortion,
        }),
      })
      await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })

      // Biaya yang dikaitkan ke domain/server langsung dibayar dari kas yang sama dengan
      // yang baru saja menerima pelunasan ini — bukan cuma angka pengurang split, tapi
      // benaran menandai domain/server itu lunas (update lastPaidAt + jurnal beban),
      // persis efeknya kalau dipakai lewat kartu "Bayar Domain"/"Bayar Server" di Keuangan.
      if (line.costLink?.type === "domain") {
        await markDomainPaid(tx, { domainId: line.costLink.id, accountId, amount: line.costAmount, paidAt, createdBy: user.id, paymentId: payment.id })
      } else if (line.costLink?.type === "server") {
        await markServerPaid(tx, { serverId: line.costLink.id, accountId, amount: line.costAmount, paidAt, createdBy: user.id, paymentId: payment.id })
      }
    }

    // Setor PPN Keluaran sekaligus (opsional, lihat ppnSettlementLines) — total PPN dari SEMUA
    // baris invoice di pembayaran ini, keluar dari akun kas/bank yang dipilih staf (boleh beda
    // dari akun yang menerima pelunasan client). Draft juga, ikut posted bareng payment ini.
    if (ppnSettlementAccountId && totalPpnPortion > 0) {
      const settlementCoaCode = await getAccountCoaCode(tx, ppnSettlementAccountId)
      const settlementTransaction = await tx.transaction.create({
        data: {
          transactionNumber: await generateTransactionNumber(tx, "expense"),
          accountId: ppnSettlementAccountId,
          type: "expense",
          grossAmount: totalPpnPortion,
          cost: 0,
          netAmount: totalPpnPortion,
          description: `Setor PPN Keluaran - ${paymentNumber}`,
          paymentId: payment.id,
          occurredAt: paidAt,
        },
      })
      const settlementJournal = await postJournalEntry(tx, {
        date: paidAt,
        description: `Setor PPN Keluaran - ${paymentNumber}`,
        sourceType: "invoice_payment",
        sourceId: settlementTransaction.id,
        createdBy: user.id,
        lines: ppnSettlementLines({ kasBankCoaCode: settlementCoaCode, amount: totalPpnPortion }),
      })
      await tx.transaction.update({ where: { id: settlementTransaction.id }, data: { journalEntryId: settlementJournal.id } })
    }

    return payment
  })

  return NextResponse.json(result, { status: 201 })
}
