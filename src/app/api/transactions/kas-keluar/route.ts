import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { postJournalEntry } from "@/lib/accounting/post-journal"
import { manualExpenseLines } from "@/lib/accounting/journal-rules"
import { getAccountCoaCode, getCategoryCoaCode } from "@/lib/accounting/coa-lookup"
import { markDomainPaid, markServerPaid } from "@/lib/accounting/mark-paid"

interface LineInput {
  kind: "manual" | "domain" | "server"
  categoryId?: string
  description?: string
  domainId?: string
  serverId?: string
  amount: number
}

/** Kas Keluar sekarang satu pintu buat semua jenis pengeluaran — bisa lebih dari 1 baris
 *  sekaligus dalam satu input, campur bebas antara pengeluaran manual DAN pembayaran
 *  domain/server (dulu dua menu terpisah "Bayar Domain"/"Bayar Server"). Tiap baris jadi 1
 *  Transaction + 1 jurnal sendiri-sendiri (bukan digabung 1 jurnal besar) — supaya tetap bisa
 *  di-posting/dibatalkan per baris kalau ternyata cuma satu yang salah input. */
export async function POST(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const accountId = typeof body?.accountId === "string" ? body.accountId : ""
  const occurredAt = typeof body?.occurredAt === "string" && body.occurredAt ? new Date(body.occurredAt) : new Date()
  const rawLines: LineInput[] = Array.isArray(body?.lines) ? body.lines : []

  if (!accountId) return NextResponse.json({ error: "Akun kas/bank wajib dipilih" }, { status: 400 })

  const lines = rawLines
    .map((l) => ({
      kind: l.kind === "domain" || l.kind === "server" ? l.kind : ("manual" as const),
      categoryId: typeof l.categoryId === "string" && l.categoryId ? l.categoryId : null,
      description: typeof l.description === "string" ? l.description : "",
      domainId: typeof l.domainId === "string" ? l.domainId : "",
      serverId: typeof l.serverId === "string" ? l.serverId : "",
      amount: Number(l.amount) || 0,
    }))
    .filter((l) => l.amount > 0)

  if (lines.length === 0) return NextResponse.json({ error: "Isi minimal 1 baris biaya" }, { status: 400 })

  const missingLink = lines.find((l) => (l.kind === "domain" && !l.domainId) || (l.kind === "server" && !l.serverId))
  if (missingLink) return NextResponse.json({ error: "Ada baris Bayar Domain/Server yang belum pilih itemnya" }, { status: 400 })

  // Sama seperti dulu waktu masih menu "Bayar Domain"/"Bayar Server" terpisah — cuma Owner yang
  // boleh, karena ini langsung menandai domain/server lunas (update lastPaidAt).
  if (lines.some((l) => l.kind !== "manual") && user.role !== "owner") {
    return NextResponse.json({ error: "Cuma Owner yang bisa input baris Bayar Domain/Server" }, { status: 403 })
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const results = []
      for (const line of lines) {
        if (line.kind === "domain") {
          results.push(await markDomainPaid(tx, { domainId: line.domainId, accountId, amount: line.amount, paidAt: occurredAt, createdBy: user.id }))
          continue
        }
        if (line.kind === "server") {
          results.push(await markServerPaid(tx, { serverId: line.serverId, accountId, amount: line.amount, paidAt: occurredAt, createdBy: user.id }))
          continue
        }

        const transaction = await tx.transaction.create({
          data: {
            accountId,
            type: "expense",
            categoryId: line.categoryId,
            grossAmount: line.amount,
            cost: 0,
            netAmount: line.amount,
            description: line.description || null,
            occurredAt,
          },
        })
        const [kasBankCoaCode, expenseCoaCode] = await Promise.all([
          getAccountCoaCode(tx, accountId),
          getCategoryCoaCode(tx, line.categoryId, "expense"),
        ])
        const journalEntry = await postJournalEntry(tx, {
          date: occurredAt,
          description: transaction.description || "Pengeluaran manual",
          sourceType: "transaction",
          sourceId: transaction.id,
          createdBy: user.id,
          lines: manualExpenseLines({ kasBankCoaCode, expenseCoaCode, grossAmount: line.amount }),
        })
        await tx.transaction.update({ where: { id: transaction.id }, data: { journalEntryId: journalEntry.id } })
        results.push({ transaction })
      }
      return results
    })

    return NextResponse.json({ ok: true, count: created.length }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan Kas Keluar" }, { status: 400 })
  }
}
