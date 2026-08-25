import { prisma } from "@/lib/prisma"

/** Saldo dihitung on-the-fly (bukan kolom berjalan) supaya tidak ada risiko saldo "nyeleneh"
 *  akibat bug — selalu direkonstruksi dari openingBalance + transaksi + Pindah Buku.
 *
 *  Dulu narik SEMUA baris Transaction/AccountTransfer punya akun ini ke memori lalu di-reduce di
 *  JS — makin berat tiap kali akun itu dipakai (Kas/Bank operasional bisa ribuan baris). Sekarang
 *  pakai groupBy/aggregate (SUM di database), cuma balik beberapa baris teragregasi, bukan tiap
 *  transaksi satu-satu. */
export async function computeAccountBalance(accountId: string): Promise<number> {
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

export async function computeAllAccountBalances(): Promise<Map<string, number>> {
  const [accounts, txGroups, transferOutGroups, transferInGroups] = await Promise.all([
    prisma.account.findMany(),
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: { postStatus: "posted" },
      _sum: { netAmount: true, grossAmount: true },
    }),
    prisma.accountTransfer.groupBy({ by: ["sourceAccountId"], where: { postStatus: "posted" }, _sum: { amount: true } }),
    prisma.accountTransfer.groupBy({ by: ["destinationAccountId"], where: { postStatus: "posted" }, _sum: { amount: true } }),
  ])

  const balances = new Map<string, number>()
  for (const account of accounts) balances.set(account.id, account.openingBalance)

  for (const g of txGroups) {
    const current = balances.get(g.accountId) ?? 0
    const delta = g.type === "income" ? (g._sum.netAmount ?? 0) : -(g._sum.grossAmount ?? 0)
    balances.set(g.accountId, current + delta)
  }

  for (const g of transferOutGroups) {
    const current = balances.get(g.sourceAccountId) ?? 0
    balances.set(g.sourceAccountId, current - (g._sum.amount ?? 0))
  }
  for (const g of transferInGroups) {
    const current = balances.get(g.destinationAccountId) ?? 0
    balances.set(g.destinationAccountId, current + (g._sum.amount ?? 0))
  }

  return balances
}
