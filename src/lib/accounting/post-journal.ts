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
  sourceType: "invoice" | "invoice_payment" | "transaction" | "recurring_bill" | "server" | "domain" | "manual" | "correction"
  /** Default "draft" — jurnal baru berlaku (masuk laporan/saldo) setelah di-posting lewat
   *  postJournalEntryFinal(). Cuma dipakai untuk kasus khusus (mis. koreksi migrasi) yang
   *  memang harus langsung final tanpa alur draft. */
  postStatus?: "draft" | "posted"
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

  const postStatus = input.postStatus ?? "draft"

  return tx.journalEntry.create({
    data: {
      entryNumber,
      date: input.date,
      description: input.description,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      createdBy: input.createdBy ?? null,
      postStatus,
      postedAt: postStatus === "posted" ? new Date() : null,
      postedById: postStatus === "posted" ? (input.createdBy ?? null) : null,
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

/** Finalisasi 1 jurnal draft (dari sourceType+sourceId) jadi posted — dipanggil oleh endpoint
 *  "Posting" masing-masing modul, di dalam prisma.$transaction yang sama dengan efek lain
 *  (update Invoice.status, lastPaidAt, dst). Validasi ulang balance jaga-jaga baris jurnalnya
 *  sempat diedit lewat PATCH selagi masih draft. No-op (aman dipanggil berkali-kali) kalau
 *  tidak ketemu jurnal draft untuk source itu (mis. invoice tanpa HPP yang memang tidak
 *  pernah punya jurnal). */
export async function postJournalEntryFinal(
  tx: TxClient,
  input: { sourceType: PostJournalInput["sourceType"]; sourceId: string; postedById: string }
) {
  const entry = await tx.journalEntry.findFirst({
    where: { sourceType: input.sourceType, sourceId: input.sourceId, postStatus: "draft" },
  })
  if (!entry) return null
  return finalizeJournalEntryById(tx, entry.id, input.postedById)
}

/** Finalisasi 1 jurnal draft langsung dari id-nya sendiri — dipakai kalau caller sudah punya
 *  JournalEntry.id pasti (mis. jurnal manual, di-posting dari halaman Akuntansi > Jurnal),
 *  beda dari postJournalEntryFinal yang mencari lewat sourceType+sourceId (ambigu untuk
 *  jurnal manual karena sourceId-nya null). */
export async function finalizeJournalEntryById(tx: TxClient, journalEntryId: string, postedById: string) {
  const entry = await tx.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: true } })
  if (!entry) return null
  if (entry.postStatus === "posted") return entry

  const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
  const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
  if (Math.abs(totalDebit - totalCredit) > EPSILON) {
    throw new Error(`Jurnal tidak balance, tidak bisa diposting: debit ${totalDebit} != kredit ${totalCredit} (${entry.description})`)
  }
  if (entry.lines.length === 0) {
    throw new Error(`Jurnal "${entry.description}" belum punya baris debit/kredit, tidak bisa diposting`)
  }

  return tx.journalEntry.update({
    where: { id: entry.id },
    data: { postStatus: "posted", postedAt: new Date(), postedById },
    include: { lines: true },
  })
}

/** Batalkan (void) 1 jurnal yang sudah posted, dari sourceType+sourceId — dipanggil oleh
 *  endpoint "Batalkan" masing-masing modul. TIDAK menghapus atau membuat jurnal pembalik
 *  terpisah — cukup tandai "voided" supaya otomatis lolos dari semua filter
 *  `postStatus: "posted"` (saldo, laporan, buku besar), tapi tetap tampil di Jurnal Umum
 *  dengan badge "Dibatalkan" untuk jejak audit. No-op kalau tidak ada jurnal posted untuk
 *  source itu (mis. invoice tanpa HPP, memang tidak pernah punya jurnal). */
export async function voidJournalEntryBySource(
  tx: TxClient,
  input: { sourceType: PostJournalInput["sourceType"]; sourceId: string; voidedById: string; voidReason?: string }
) {
  const entry = await tx.journalEntry.findFirst({
    where: { sourceType: input.sourceType, sourceId: input.sourceId, postStatus: "posted" },
  })
  if (!entry) return null
  return tx.journalEntry.update({
    where: { id: entry.id },
    data: { postStatus: "voided", voidedAt: new Date(), voidedById: input.voidedById, voidReason: input.voidReason ?? null },
  })
}
