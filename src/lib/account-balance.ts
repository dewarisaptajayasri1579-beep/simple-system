import { prisma } from "@/lib/prisma"

/** SATU-SATUNYA sumber saldo kas/bank = saldo Buku Besar akun COA-nya (debit − kredit dari
 *  JournalLine, jurnal ber-status "posted" saja).
 *
 *  Dulu saldo dihitung dari sisi operasional (Account.openingBalance + Transaction +
 *  AccountTransfer). Masalahnya ada DUA angka untuk satu rekening yang sama dan keduanya bisa
 *  melenceng jauh: jurnal manual (Jurnal Umum) menggerakkan Buku Besar tapi TIDAK lewat
 *  Transaction/AccountTransfer, jadi tidak kelihatan di sisi operasional. Akibatnya dialog
 *  posting Kas Keluar bisa bilang saldo minus padahal halaman Daftar Akun menampilkan saldo
 *  positif (kejadian nyata di BCA 790**74: −9.664.371 vs 1.163.335, selisihnya persis 10 jurnal
 *  manual). Sekarang keduanya baca dari sumber yang sama, jadi tidak bisa beda lagi.
 *
 *  Kas Masuk/Kas Keluar/Pindah Buku/Pembayaran tetap terhitung karena semuanya memang sudah
 *  menulis jurnal saat di-posting (lihat post-journal.ts + journal-rules.ts) — yang bertambah
 *  cuma jurnal manual, yang sebelumnya tidak terhitung sama sekali.
 *
 *  Saldo awal rekening: yang dipakai adalah jurnal "account_opening_balance"-nya (dibuat saat
 *  Saldo Awal diisi/diubah di Master Akun), BUKAN kolom Account.openingBalance — kolom itu kini
 *  murni penyimpan angka input, bukan komponen saldo. */
export async function computeAccountBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { coaAccountId: true },
  })
  if (!account.coaAccountId) return computeAccountBalanceFromOperations(accountId)

  const agg = await prisma.journalLine.aggregate({
    where: { accountId: account.coaAccountId, journalEntry: { postStatus: "posted" } },
    _sum: { debit: true, credit: true },
  })
  return (agg._sum.debit ?? 0) - (agg._sum.credit ?? 0)
}

/** Rumus lama (openingBalance + Transaction + AccountTransfer). Sekarang cuma dipakai sebagai
 *  cadangan untuk Account yang belum punya akun COA sendiri — normalnya tidak ada, karena
 *  seed-coa.ts membuatkan akun anak di bawah "1-1000 Kas & Bank" untuk tiap kas/bank. Sengaja
 *  dipertahankan (bukan dihapus) supaya rekening baru yang belum ke-seed COA-nya tidak langsung
 *  tampil Rp0 dan kena blokir guard "tidak boleh minus". */
async function computeAccountBalanceFromOperations(accountId: string): Promise<number> {
  const [account, txByType, transferOut, transferIn] = await Promise.all([
    prisma.account.findUniqueOrThrow({ where: { id: accountId } }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: { accountId, postStatus: "posted" },
      _sum: { netAmount: true, grossAmount: true },
    }),
    prisma.accountTransfer.aggregate({ where: { sourceAccountId: accountId, postStatus: "posted" }, _sum: { amount: true } }),
    prisma.accountTransfer.aggregate({ where: { destinationAccountId: accountId, postStatus: "posted" }, _sum: { amount: true } }),
  ])

  const delta = txByType.reduce(
    (sum, g) => sum + (g.type === "income" ? (g._sum.netAmount ?? 0) : -(g._sum.grossAmount ?? 0)),
    0
  )
  const transferDelta = (transferIn._sum.amount ?? 0) - (transferOut._sum.amount ?? 0)
  return account.openingBalance + delta + transferDelta
}

/** Versi massal computeAccountBalance() — 1 groupBy untuk semua akun sekaligus, bukan query
 *  per akun (dipakai Neraca, Arus Kas, laporan mingguan, dan daftar kas/bank). */
export async function computeAllAccountBalances(): Promise<Map<string, number>> {
  const accounts = await prisma.account.findMany({ select: { id: true, coaAccountId: true } })
  const coaIds = [...new Set(accounts.map((a) => a.coaAccountId).filter((id): id is string => !!id))]

  const ledgerGroups = coaIds.length
    ? await prisma.journalLine.groupBy({
        by: ["accountId"],
        where: { accountId: { in: coaIds }, journalEntry: { postStatus: "posted" } },
        _sum: { debit: true, credit: true },
      })
    : []
  const ledgerByCoa = new Map(ledgerGroups.map((g) => [g.accountId, (g._sum.debit ?? 0) - (g._sum.credit ?? 0)]))

  const balances = new Map<string, number>()
  for (const account of accounts) {
    if (account.coaAccountId) balances.set(account.id, ledgerByCoa.get(account.coaAccountId) ?? 0)
  }
  // Cadangan untuk akun tanpa COA — lihat computeAccountBalanceFromOperations.
  for (const account of accounts) {
    if (!account.coaAccountId) balances.set(account.id, await computeAccountBalanceFromOperations(account.id))
  }

  return balances
}
