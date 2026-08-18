import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { voidJournalEntryById } from "@/lib/accounting/post-journal"

/** Batalkan Pindah Buku yang sudah posted (salah input) — Owner-only, sama pola dengan
 *  POST /api/transactions/[id]/void. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa membatalkan Pindah Buku yang sudah posted" }, { status: 403 })

  const { id } = await params
  const transfer = await prisma.accountTransfer.findUnique({ where: { id } })
  if (!transfer) return NextResponse.json({ error: "Pindah Buku tidak ditemukan" }, { status: 404 })
  if (transfer.postStatus !== "posted") return NextResponse.json({ error: "Cuma Pindah Buku yang sudah posted yang bisa dibatalkan" }, { status: 400 })

  const body = await request.json().catch(() => null)
  const voidReason = typeof body?.reason === "string" ? body.reason.trim() || null : null

  const voided = await prisma.$transaction(async (tx) => {
    if (transfer.journalEntryId) {
      await voidJournalEntryById(tx, transfer.journalEntryId, user.id, voidReason ?? undefined)
    }
    return tx.accountTransfer.update({
      where: { id },
      data: { postStatus: "voided", voidedAt: new Date(), voidedById: user.id, voidReason },
    })
  })

  return NextResponse.json(voided)
}
