import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { finalizeJournalEntryById } from "@/lib/accounting/post-journal"
import { assertKasBankCoaNotNegative, snapshotKasBankCoaBalances } from "@/lib/accounting/cash-guard"

/** Posting jurnal manual draft — Owner-only, sama seperti pembuatannya. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa posting jurnal manual" }, { status: 403 })

  const { id } = await params
  const entry = await prisma.journalEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (entry.postStatus !== "draft") return NextResponse.json({ error: "Jurnal ini bukan draft (sudah diposting/dibatalkan)" }, { status: 400 })

  try {
    const posted = await prisma.$transaction(async (tx) => {
      const before = await snapshotKasBankCoaBalances(tx, id)
      const result = await finalizeJournalEntryById(tx, id, user.id)
      // Jurnal manual tidak lewat Transaction, jadi saldo Account tidak bergerak — yang bergerak
      // saldo akun COA Kas & Bank di Buku Besar. Itu yang dijaga supaya tidak minus.
      await assertKasBankCoaNotNegative(tx, id, before)
      return result
    })
    return NextResponse.json(posted)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal posting jurnal" }, { status: 400 })
  }
}
