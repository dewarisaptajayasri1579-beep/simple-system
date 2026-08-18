import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { accountTransferLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"
import { generateTransferNumber } from "@/lib/transaction-number"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const transfers = await prisma.accountTransfer.findMany({
    include: { sourceAccount: true, destinationAccount: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(transfers)
}

/** Pindah Buku — pindahkan saldo dari 1 akun kas/bank ke akun kas/bank lain sendiri (mis. tarik
 *  tunai ATM, setor tunai). Draft dulu (sama pola Kas Keluar/Masuk) — baru masuk saldo/laporan
 *  begitu di-posting lewat POST /api/account-transfers/[id]/post. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const sourceAccountId = typeof body?.sourceAccountId === "string" ? body.sourceAccountId : ""
  const destinationAccountId = typeof body?.destinationAccountId === "string" ? body.destinationAccountId : ""
  const amount = Number(body?.amount) || 0
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const occurredAt = body?.occurredAt ? new Date(body.occurredAt) : new Date()

  if (!sourceAccountId) return NextResponse.json({ error: "Akun sumber wajib dipilih" }, { status: 400 })
  if (!destinationAccountId) return NextResponse.json({ error: "Akun tujuan wajib dipilih" }, { status: 400 })
  if (sourceAccountId === destinationAccountId) return NextResponse.json({ error: "Akun sumber dan tujuan tidak boleh sama" }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal tidak valid" }, { status: 400 })

  try {
    const created = await prisma.$transaction(async (tx) => {
      const transfer = await tx.accountTransfer.create({
        data: {
          transferNumber: await generateTransferNumber(tx),
          sourceAccountId,
          destinationAccountId,
          amount,
          description: description || null,
          occurredAt,
        },
      })

      const [sourceKasBankCoaCode, destinationKasBankCoaCode] = await Promise.all([
        getAccountCoaCode(tx, sourceAccountId),
        getAccountCoaCode(tx, destinationAccountId),
      ])
      const journalEntry = await postJournalEntry(tx, {
        date: occurredAt,
        description: transfer.description || "Pindah Buku",
        sourceType: "transfer",
        sourceId: transfer.id,
        createdBy: user.id,
        lines: accountTransferLines({ sourceKasBankCoaCode, destinationKasBankCoaCode, amount }),
      })

      return tx.accountTransfer.update({
        where: { id: transfer.id },
        data: { journalEntryId: journalEntry.id },
        include: { sourceAccount: true, destinationAccount: true },
      })
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error("[POST /api/account-transfers]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan Pindah Buku" }, { status: 500 })
  }
}
