import type { Prisma } from "@prisma/client"

export type TxClient = Prisma.TransactionClient

export interface JournalLineInput {
  /** Salah satu wajib diisi — accountCode dipakai oleh rule auto-posting (journal-rules.ts),
   *  accountId dipakai oleh form jurnal manual (user pilih akun langsung dari dropdown COA). */
  accountCode?: string
  accountId?: string
  debit?: number
  credit?: number
  memo?: string
}

export interface PostJournalInput {
  date: Date
  description: string
  sourceType: "invoice" | "invoice_payment" | "transaction" | "recurring_bill" | "server" | "domain" | "manual"
  sourceId?: string
  createdBy?: string
  lines: JournalLineInput[]
}

const EPSILON = 0.5 // toleransi pembulatan rupiah antar baris jurnal

/** Posting jurnal debit/kredit — validasi balance, resolve kode akun -> id, generate nomor
 *  entry, tulis JournalEntry + JournalLine. Terima `tx` (Prisma transaction client) supaya
 *  selalu ikut menumpang transaksi caller yang sudah ada (invoice/payment/transaction),
 *  bukan buka transaksi baru sendiri — kalau caller rollback, jurnal ikut rollback. */
export async function postJournalEntry(tx: TxClient, input: PostJournalInput) {
  const totalDebit = input.lines.reduce((s, l) => s + (l.debit ?? 0), 0)
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0)
  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    throw new Error(
      `Jurnal tidak balance: debit ${totalDebit} != kredit ${totalCredit} (${input.description})`
    )
  }

  const codes = [...new Set(input.lines.map((l) => l.accountCode).filter((c): c is string => !!c))]
  const ids = [...new Set(input.lines.map((l) => l.accountId).filter((i): i is string => !!i))]
  const accounts = await tx.chartOfAccount.findMany({ where: { OR: [{ code: { in: codes } }, { id: { in: ids } }] } })
  const accountByCode = new Map(accounts.map((a) => [a.code, a]))
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const resolveAccountId = (line: JournalLineInput): string => {
    if (line.accountCode) {
      const account = accountByCode.get(line.accountCode)
      if (!account) throw new Error(`Kode akun COA "${line.accountCode}" tidak ditemukan`)
      return account.id
    }
    if (line.accountId) {
      const account = accountById.get(line.accountId)
      if (!account) throw new Error(`Akun COA dengan id "${line.accountId}" tidak ditemukan`)
      return account.id
    }
    throw new Error("Setiap baris jurnal wajib punya accountCode atau accountId")
  }

  const year = input.date.getFullYear()
  const countThisYear = await tx.journalEntry.count({
    where: { entryNumber: { startsWith: `JE-${year}-` } },
  })
  const entryNumber = `JE-${year}-${String(countThisYear + 1).padStart(6, "0")}`

  return tx.journalEntry.create({
    data: {
      entryNumber,
      date: input.date,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      createdBy: input.createdBy ?? null,
      lines: {
        create: input.lines
          .filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0)
          .map((l) => ({
            accountId: resolveAccountId(l),
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
            memo: l.memo ?? null,
          })),
      },
    },
    include: { lines: true },
  })
}
