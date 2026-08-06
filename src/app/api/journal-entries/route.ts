import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry, type JournalLineInput } from "@/lib/accounting/post-journal"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const entries = await prisma.journalEntry.findMany({
    include: { lines: { include: { account: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  })
  return NextResponse.json(entries)
}

interface LineInput {
  accountId: string
  debit?: number
  credit?: number
  memo?: string
}

export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa buat jurnal manual" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  const date = body?.date ? new Date(body.date) : new Date()
  const rawLines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []

  if (!description) return NextResponse.json({ error: "Deskripsi wajib diisi" }, { status: 400 })

  const lines: JournalLineInput[] = rawLines
    .map((l) => ({
      accountId: typeof l.accountId === "string" ? l.accountId : "",
      debit: Math.max(0, Number(l.debit) || 0),
      credit: Math.max(0, Number(l.credit) || 0),
      memo: typeof l.memo === "string" && l.memo ? l.memo : undefined,
    }))
    .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0))

  if (lines.length < 2) return NextResponse.json({ error: "Minimal 2 baris jurnal (debit dan kredit)" }, { status: 400 })

  try {
    const entry = await postJournalEntry(prisma, {
      date,
      description,
      sourceType: "manual",
      createdBy: user.id,
      lines,
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal posting jurnal" }, { status: 400 })
  }
}
