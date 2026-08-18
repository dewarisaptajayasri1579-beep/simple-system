import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { finalizeJournalEntryById } from "@/lib/accounting/post-journal"

/** Posting Pindah Buku draft — finalisasi jurnal draft-nya jadi posted, baru dari titik ini
 *  saldo kedua akun kas/bank ikut bergerak (lihat computeAccountBalance/Buku Besar). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const { id } = await params
  const transfer = await prisma.accountTransfer.findUnique({ where: { id } })
  if (!transfer) return NextResponse.json({ error: "Pindah Buku tidak ditemukan" }, { status: 404 })
  if (transfer.postStatus !== "draft") return NextResponse.json({ error: "Pindah Buku ini bukan draft (sudah diposting/dibatalkan)" }, { status: 400 })

  const posted = await prisma.$transaction(async (tx) => {
    if (transfer.journalEntryId) {
      await finalizeJournalEntryById(tx, transfer.journalEntryId, user.id)
    }
    return tx.accountTransfer.update({
      where: { id },
      data: { postStatus: "posted", postedAt: new Date(), postedById: user.id },
      include: { sourceAccount: true, destinationAccount: true },
    })
  })

  return NextResponse.json(posted)
}
