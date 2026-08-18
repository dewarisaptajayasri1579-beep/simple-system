import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { accountTransferLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode } from "@/lib/accounting/coa-lookup"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transfer = await prisma.accountTransfer.findUnique({ where: { id }, include: { sourceAccount: true, destinationAccount: true } })
  if (!transfer) return NextResponse.json({ error: "Pindah Buku tidak ditemukan" }, { status: 404 })
  return NextResponse.json(transfer)
}

/** Edit Pindah Buku yang masih draft — akun sumber/tujuan/nominal/tanggal/keterangan. Sama
 *  pola dengan PATCH /api/transactions/[id]: jurnal draft yang menempel dihapus & dibuat ulang
 *  supaya tetap sinkron dengan akun/nominal barunya. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transfer = await prisma.accountTransfer.findUnique({ where: { id } })
  if (!transfer) return NextResponse.json({ error: "Pindah Buku tidak ditemukan" }, { status: 404 })
  if (transfer.postStatus !== "draft") {
    return NextResponse.json({ error: "Pindah Buku yang sudah diposting/dibatalkan tidak bisa diedit" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const sourceAccountId = typeof body?.sourceAccountId === "string" ? body.sourceAccountId : ""
  const destinationAccountId = typeof body?.destinationAccountId === "string" ? body.destinationAccountId : ""
  const amount = Number(body?.amount) || 0
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const occurredAt = body?.occurredAt ? new Date(body.occurredAt) : transfer.occurredAt

  if (!sourceAccountId) return NextResponse.json({ error: "Akun sumber wajib dipilih" }, { status: 400 })
  if (!destinationAccountId) return NextResponse.json({ error: "Akun tujuan wajib dipilih" }, { status: 400 })
  if (sourceAccountId === destinationAccountId) return NextResponse.json({ error: "Akun sumber dan tujuan tidak boleh sama" }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: "Nominal tidak valid" }, { status: 400 })

  const journalWhere = transfer.journalEntryId
    ? { id: transfer.journalEntryId, postStatus: "draft" as const }
    : { sourceType: "transfer" as const, sourceId: transfer.id, postStatus: "draft" as const }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: journalWhere })

    const saved = await tx.accountTransfer.update({
      where: { id },
      data: { sourceAccountId, destinationAccountId, amount, description: description || null, occurredAt },
    })

    const [sourceKasBankCoaCode, destinationKasBankCoaCode] = await Promise.all([
      getAccountCoaCode(tx, sourceAccountId),
      getAccountCoaCode(tx, destinationAccountId),
    ])
    const journalEntry = await postJournalEntry(tx, {
      date: saved.occurredAt,
      description: saved.description || "Pindah Buku",
      sourceType: "transfer",
      sourceId: saved.id,
      createdBy: user.id,
      lines: accountTransferLines({ sourceKasBankCoaCode, destinationKasBankCoaCode, amount }),
    })

    return tx.accountTransfer.update({
      where: { id: saved.id },
      data: { journalEntryId: journalEntry.id },
      include: { sourceAccount: true, destinationAccount: true },
    })
  })

  return NextResponse.json(updated)
}

/** Hapus Pindah Buku DRAFT (belum diposting) — sama pola dengan DELETE /api/transactions/[id]. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transfer = await prisma.accountTransfer.findUnique({ where: { id } })
  if (!transfer) return NextResponse.json({ error: "Pindah Buku tidak ditemukan" }, { status: 404 })
  if (transfer.postStatus !== "draft") {
    return NextResponse.json({ error: "Pindah Buku yang sudah diposting/dibatalkan tidak bisa dihapus" }, { status: 400 })
  }

  const journalWhere = transfer.journalEntryId
    ? { id: transfer.journalEntryId, postStatus: "draft" as const }
    : { sourceType: "transfer" as const, sourceId: transfer.id, postStatus: "draft" as const }

  await prisma.$transaction([
    prisma.journalEntry.deleteMany({ where: journalWhere }),
    prisma.accountTransfer.delete({ where: { id } }),
  ])

  return NextResponse.json({ ok: true })
}
