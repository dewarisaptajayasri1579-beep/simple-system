import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { finalizeJournalEntryById } from "@/lib/accounting/post-journal"

/** Posting jurnal manual draft — Owner-only, sama seperti pembuatannya. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa posting jurnal manual" }, { status: 403 })

  const { id } = await params
  const entry = await prisma.journalEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: "Jurnal tidak ditemukan" }, { status: 404 })
  if (entry.postStatus !== "draft") return NextResponse.json({ error: "Jurnal ini bukan draft (sudah diposting/dibatalkan)" }, { status: 400 })

  const posted = await prisma.$transaction(async (tx) => finalizeJournalEntryById(tx, id, user.id))

  return NextResponse.json(posted)
}
