import type { TxClient } from "./post-journal"
import { COA_CODE } from "./coa-seed"

/** Toleransi pembulatan rupiah — sama semangatnya dengan EPSILON di post-journal.ts. Saldo
 *  -0,3 dianggap 0 (efek pembulatan split/persentase), bukan minus beneran. */
const EPSILON = 0.5

function formatRupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`
}

/** Kembaran computeAccountBalance() (src/lib/account-balance.ts) yang jalan DI DALAM sebuah
 *  prisma.$transaction — wajib pakai `tx`, bukan client global, supaya yang dilihat adalah
 *  saldo SETELAH perubahan yang belum di-commit di transaksi ini (posting yang sedang jalan).
 *  Kalau pakai prisma global, perubahan itu belum kelihatan dan guard-nya jadi tidak ada
 *  gunanya. Rumusnya sengaja dijaga identik dengan yang di account-balance.ts. */
export async function computeAccountBalanceTx(tx: TxClient, accountId: string): Promise<number> {
  const [account, txByType, transferOut, transferIn] = await Promise.all([
    tx.account.findUniqueOrThrow({ where: { id: accountId } }),
    tx.transaction.groupBy({
      by: ["type"],
      where: { accountId, postStatus: "posted" },
      _sum: { netAmount: true, grossAmount: true },
    }),
    tx.accountTransfer.aggregate({ where: { sourceAccountId: accountId, postStatus: "posted" }, _sum: { amount: true } }),
    tx.accountTransfer.aggregate({ where: { destinationAccountId: accountId, postStatus: "posted" }, _sum: { amount: true } }),
  ])

  const delta = txByType.reduce(
    (sum, g) => sum + (g.type === "income" ? (g._sum.netAmount ?? 0) : -(g._sum.grossAmount ?? 0)),
    0
  )
  const transferDelta = (transferIn._sum.amount ?? 0) - (transferOut._sum.amount ?? 0)
  return account.openingBalance + delta + transferDelta
}

/** Saldo akun SEBELUM aksi ini dieksekusi — dipanggil di awal prisma.$transaction, hasilnya
 *  diteruskan ke assertAccountsNotNegative di akhir. Gunanya: membedakan "aksi ini yang bikin
 *  minus" (ditolak) dari "akunnya memang sudah minus dari data lama, dan aksi ini justru
 *  memperbaiki/tidak memperburuk" (diloloskan) — kalau tidak dibedakan, akun yang sudah minus
 *  jadi terkunci total, bahkan untuk uang MASUK yang menutup minusnya. */
export async function snapshotAccountBalances(tx: TxClient, accountIds: (string | null | undefined)[]): Promise<Map<string, number>> {
  const snapshot = new Map<string, number>()
  for (const accountId of [...new Set(accountIds.filter((id): id is string => !!id))]) {
    snapshot.set(accountId, await computeAccountBalanceTx(tx, accountId))
  }
  return snapshot
}

/** Aturan keuangan: pembayaran tidak boleh bikin saldo kas/bank minus. Dipanggil di AKHIR
 *  prisma.$transaction masing-masing endpoint posting/void — setelah semua efeknya ditulis, jadi
 *  yang dicek adalah saldo akhir yang sebenarnya, bukan hitung-hitungan delta terpisah yang bisa
 *  drift dari rumus saldo. Kalau ditolak, throw -> seluruh transaksi ikut rollback (posting gagal
 *  utuh, bukan setengah jadi). */
export async function assertAccountsNotNegative(
  tx: TxClient,
  accountIds: (string | null | undefined)[],
  before?: Map<string, number>
): Promise<void> {
  for (const accountId of [...new Set(accountIds.filter((id): id is string => !!id))]) {
    const after = await computeAccountBalanceTx(tx, accountId)
    if (after >= -EPSILON) continue
    // Akun yang saldonya SUDAH minus sebelum aksi ini (warisan data lama) tetap boleh menerima
    // uang masuk / dikoreksi — yang dilarang cuma aksi yang menurunkan saldonya lebih jauh.
    const previous = before?.get(accountId)
    if (previous != null && after >= previous - EPSILON) continue
    const account = await tx.account.findUnique({ where: { id: accountId }, select: { name: true } })
    throw new Error(
      `Saldo ${account?.name ?? "kas/bank"} akan jadi minus ${formatRupiah(Math.abs(after))} — saldo kas/bank tidak boleh minus. ` +
        `Kurangi nominalnya, atau pakai akun kas/bank lain yang saldonya cukup.`
    )
  }
}

/** Akun COA Kas & Bank yang disentuh 1 jurnal — "1-1000 Kas & Bank" sendiri atau anak-anaknya. */
async function kasBankCoaOfEntry(tx: TxClient, journalEntryId: string) {
  const entry = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { lines: { include: { account: true } } },
  })
  if (!entry) return []

  const kasBankParent = await tx.chartOfAccount.findUnique({ where: { code: COA_CODE.kasBankParent }, select: { id: true } })
  const touched = new Map<string, { id: string; code: string; name: string }>()
  for (const line of entry.lines) {
    const coa = line.account
    const isKasBank = coa.code === COA_CODE.kasBankParent || (kasBankParent != null && coa.parentId === kasBankParent.id)
    if (isKasBank) touched.set(coa.id, { id: coa.id, code: coa.code, name: coa.name })
  }
  return [...touched.values()]
}

/** Saldo buku besar 1 akun COA = debit - kredit semua jurnal posted (Kas & Bank akun aset/debit
 *  normal, termasuk jurnal saldo awal akun — sourceType "account_opening_balance"). */
async function coaLedgerBalance(tx: TxClient, coaAccountId: string): Promise<number> {
  const agg = await tx.journalLine.aggregate({
    where: { accountId: coaAccountId, journalEntry: { postStatus: "posted" } },
    _sum: { debit: true, credit: true },
  })
  return (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0)
}

/** Padanan snapshotAccountBalances untuk jurnal manual (lihat assertKasBankCoaNotNegative). */
export async function snapshotKasBankCoaBalances(tx: TxClient, journalEntryId: string): Promise<Map<string, number>> {
  const snapshot = new Map<string, number>()
  for (const coa of await kasBankCoaOfEntry(tx, journalEntryId)) {
    snapshot.set(coa.id, await coaLedgerBalance(tx, coa.id))
  }
  return snapshot
}

/** Padanan assertAccountsNotNegative untuk JURNAL MANUAL. Jurnal manual tidak lewat
 *  Transaction/AccountTransfer, jadi tidak menggerakkan saldo Account (lihat
 *  computeAccountBalance) — yang bergerak adalah saldo akun COA Kas & Bank di Buku Besar.
 *  Jadi itu yang dijaga: baris jurnal yang menyentuh "1-1000 Kas & Bank" atau anak-anaknya tidak
 *  boleh bikin saldo akun itu minus. */
export async function assertKasBankCoaNotNegative(
  tx: TxClient,
  journalEntryId: string,
  before?: Map<string, number>
): Promise<void> {
  for (const coa of await kasBankCoaOfEntry(tx, journalEntryId)) {
    const after = await coaLedgerBalance(tx, coa.id)
    if (after >= -EPSILON) continue
    const previous = before?.get(coa.id)
    if (previous != null && after >= previous - EPSILON) continue
    throw new Error(
      `Saldo buku besar ${coa.code} — ${coa.name} akan jadi minus ${formatRupiah(Math.abs(after))} — saldo kas/bank tidak boleh minus. ` +
        `Perbaiki dulu baris jurnalnya.`
    )
  }
}
