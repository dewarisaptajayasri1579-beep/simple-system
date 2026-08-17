import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { accountMovement } from "@/lib/accounting/coa-balance"
import { monthPeriod } from "@/lib/accounting/month-period"
import { jakartaTodayDateIso } from "@/lib/datetime"

/** Versi JSON dari src/app/akuntansi/buku-besar/page.tsx — dipakai oleh modal "Mutasi" di
 *  COA (CoaList.tsx) supaya staf bisa intip buku besar 1 akun tanpa pindah halaman. Logika
 *  saldo awal/mutasi/saldo akhir SENGAJA disalin persis (bukan di-refactor jadi shared
 *  function) — page.tsx tetap satu-satunya sumber kalau nanti ada yang mau diaudit ulang. */
export async function GET(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner" && user.role !== "direktur") {
    return NextResponse.json({ error: "Cuma Owner/Direktur yang bisa lihat Buku Besar" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get("accountId") || ""
  const month = searchParams.get("month") || jakartaTodayDateIso().slice(0, 7)
  const { from, to } = monthPeriod(month)

  const account = accountId ? await prisma.chartOfAccount.findUnique({ where: { id: accountId } }) : null
  if (!account) return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 })

  const lines = await prisma.journalLine.findMany({
    where: { accountId, journalEntry: { is: { postStatus: "posted" } } },
    include: { journalEntry: true },
    orderBy: [{ journalEntry: { date: "asc" } }, { journalEntry: { createdAt: "asc" } }],
  })

  const movement = (debit: number, credit: number) => accountMovement(account.type, debit, credit)

  const saldoAwal = lines.filter((l) => l.journalEntry.date < from).reduce((s, l) => s + movement(l.debit, l.credit), 0)

  const periodLines = lines.filter((l) => l.journalEntry.date >= from && l.journalEntry.date <= to)

  let running = saldoAwal
  const rows = periodLines.map((l) => {
    running += movement(l.debit, l.credit)
    const isDebit = l.debit > 0
    return {
      id: l.id,
      journalEntryId: l.journalEntry.id,
      date: l.journalEntry.date,
      entryNumber: l.journalEntry.entryNumber,
      description: l.memo || l.journalEntry.description,
      dk: isDebit ? "D" : "K",
      nominal: isDebit ? l.debit : l.credit,
      saldo: running,
    }
  })

  const totalDebit = periodLines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = periodLines.reduce((s, l) => s + l.credit, 0)
  const saldoAkhir = running

  return NextResponse.json({
    account: { id: account.id, code: account.code, name: account.name },
    month,
    saldoAwal,
    totalDebit,
    totalCredit,
    saldoAkhir,
    rows,
  })
}
