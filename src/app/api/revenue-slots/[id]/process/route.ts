import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry, finalizeJournalEntryById } from "@/lib/accounting/post-journal"
import { finalizeTransactionPosting } from "@/lib/accounting/mark-paid"
import { accountTransferLines, manualExpenseLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { COA_CODE } from "@/lib/accounting/coa-seed"
import { generateTransferNumber, generateTransactionNumber } from "@/lib/transaction-number"

interface Bucket {
  label: string
  pct: number
  accountId: string | null
}

/** Eksekusi 1 Slotting Omset draft: hitung Laba Bersih final (grossAmount - initialCostAmount -
 *  additionalCostAmount), bagi ke 4 rekening (Operasional/Direksi/Bonus/Cadangan HPP) via Pindah
 *  Buku otomatis (langsung posted, bukan draft — sekali "Proses" ditekan dianggap final), potong
 *  biaya admin dari nominal yang ditransfer kalau bank sumber & tujuan beda (dicatat terpisah
 *  sebagai Transaction beban "Biaya Admin Bank" dari akun sumber, biar kelihatan di Kas Keluar &
 *  Buku Besar). Owner-only — sama gate dengan Jurnal Manual, ini gerakan uang otomatis berbasis
 *  persentase, bukan input 1-1 yang gampang dikoreksi. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa proses Slotting Omset" }, { status: 403 })

  const { id } = await params
  const slot = await prisma.revenueSlot.findUnique({ where: { id }, include: { payment: true } })
  if (!slot) return NextResponse.json({ error: "Slotting Omset tidak ditemukan" }, { status: 404 })
  if (slot.status !== "draft") return NextResponse.json({ error: "Sudah diproses sebelumnya" }, { status: 400 })

  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } })

  const buckets: Bucket[] = [
    { label: "Operasional", pct: settings.slottingOperasionalPct, accountId: settings.slottingOperasionalAccountId },
    { label: "Direksi", pct: settings.slottingDireksiPct, accountId: settings.slottingDireksiAccountId },
    { label: "Bonus", pct: settings.slottingBonusPct, accountId: settings.slottingBonusAccountId },
    { label: "Cadangan HPP", pct: settings.slottingHppReservePct, accountId: settings.slottingHppReserveAccountId },
  ]
  const missing = buckets.filter((b) => !b.accountId)
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Rekening tujuan belum di-set di Pengaturan: ${missing.map((b) => b.label).join(", ")}` },
      { status: 400 }
    )
  }
  const totalPct = buckets.reduce((s, b) => s + b.pct, 0)
  if (Math.abs(totalPct - 100) > 0.01) {
    return NextResponse.json({ error: `Total persentase Slotting Omset di Pengaturan harus 100% (sekarang ${totalPct}%)` }, { status: 400 })
  }

  const netAmount = slot.grossAmount - slot.initialCostAmount - slot.additionalCostAmount
  if (netAmount <= 0) {
    return NextResponse.json({ error: `Laba bersih tidak positif (Rp${netAmount.toLocaleString("id-ID")}) — tidak bisa diproses` }, { status: 400 })
  }

  const sourceAccountId = slot.payment.accountId
  const sourceAccount = await prisma.account.findUniqueOrThrow({ where: { id: sourceAccountId } })

  try {
    const result = await prisma.$transaction(async (tx) => {
      const amounts: Record<string, number> = {}
      let transferFeeTotal = 0

      for (const bucket of buckets) {
        const bucketAmount = Math.round((netAmount * bucket.pct) / 100)
        amounts[bucket.label] = bucketAmount
        if (bucketAmount <= 0) continue

        const destinationAccount = await tx.account.findUniqueOrThrow({ where: { id: bucket.accountId! } })
        // Biaya admin cuma relevan buat transfer ANTAR BANK beneran — Kas <-> Bank (setor/tarik
        // tunai) bukan transfer bank, jadi tidak kena biaya ini walau "bank"-nya beda/kosong.
        const feeApplies = sourceAccount.type === "bank" && destinationAccount.type === "bank" && sourceAccount.bankName !== destinationAccount.bankName
        const fee = feeApplies ? settings.slottingTransferFee : 0
        const transferAmount = bucketAmount - fee
        if (transferAmount <= 0) {
          throw new Error(`Porsi ${bucket.label} (Rp${bucketAmount.toLocaleString("id-ID")}) lebih kecil dari biaya admin transfer (Rp${fee.toLocaleString("id-ID")})`)
        }

        const [sourceCoaCode, destinationCoaCode] = await Promise.all([
          getAccountCoaCode(tx, sourceAccountId),
          getAccountCoaCode(tx, bucket.accountId!),
        ])

        const transfer = await tx.accountTransfer.create({
          data: {
            transferNumber: await generateTransferNumber(tx),
            sourceAccountId,
            destinationAccountId: bucket.accountId!,
            amount: transferAmount,
            description: `Slotting Omset ${bucket.label} — ${slot.payment.paymentNumber}`,
            createdById: user.id,
            revenueSlotId: slot.id,
          },
        })
        const transferJournal = await postJournalEntry(tx, {
          date: transfer.occurredAt,
          description: transfer.description!,
          sourceType: "transfer",
          sourceId: transfer.id,
          createdBy: user.id,
          lines: accountTransferLines({ sourceKasBankCoaCode: sourceCoaCode, destinationKasBankCoaCode: destinationCoaCode, amount: transferAmount }),
        })
        await tx.accountTransfer.update({ where: { id: transfer.id }, data: { journalEntryId: transferJournal.id } })
        await finalizeJournalEntryById(tx, transferJournal.id, user.id)
        await tx.accountTransfer.update({ where: { id: transfer.id }, data: { postStatus: "posted", postedAt: new Date(), postedById: user.id } })

        if (fee > 0) {
          transferFeeTotal += fee
          const feeTransaction = await tx.transaction.create({
            data: {
              transactionNumber: await generateTransactionNumber(tx, "expense"),
              accountId: sourceAccountId,
              type: "expense",
              grossAmount: fee,
              cost: 0,
              netAmount: fee,
              description: `Biaya admin transfer ${bucket.label} — ${slot.payment.paymentNumber}`,
              createdById: user.id,
            },
          })
          const feeJournal = await postJournalEntry(tx, {
            date: feeTransaction.occurredAt,
            description: feeTransaction.description!,
            sourceType: "transaction",
            sourceId: feeTransaction.id,
            createdBy: user.id,
            lines: manualExpenseLines({ kasBankCoaCode: sourceCoaCode, expenseCoaCode: COA_CODE.bebanLain, grossAmount: fee }),
          })
          await tx.transaction.update({ where: { id: feeTransaction.id }, data: { journalEntryId: feeJournal.id } })
          await finalizeTransactionPosting(tx, { transactionId: feeTransaction.id, postedById: user.id })
        }
      }

      return tx.revenueSlot.update({
        where: { id: slot.id },
        data: {
          netAmount,
          operasionalPct: buckets[0].pct,
          direksiPct: buckets[1].pct,
          bonusPct: buckets[2].pct,
          hppReservePct: buckets[3].pct,
          operasionalAmount: amounts["Operasional"],
          direksiAmount: amounts["Direksi"],
          bonusAmount: amounts["Bonus"],
          hppReserveAmount: amounts["Cadangan HPP"],
          transferFeeTotal,
          status: "processed",
          processedAt: new Date(),
          processedById: user.id,
        },
        include: { transfers: { include: { sourceAccount: true, destinationAccount: true, journalEntry: true } }, costLines: true },
      })
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal proses Slotting Omset" }, { status: 400 })
  }
}
