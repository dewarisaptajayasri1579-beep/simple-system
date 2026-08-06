import { prisma } from "@/lib/prisma"

/** Saldo dihitung on-the-fly (bukan kolom berjalan) supaya tidak ada risiko saldo "nyeleneh"
 *  akibat bug — selalu direkonstruksi dari openingBalance + transaksi. */
export async function computeAccountBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
  const transactions = await prisma.transaction.findMany({ where: { accountId } })

  const delta = transactions.reduce((sum, t) => (t.type === "income" ? sum + t.netAmount : sum - t.grossAmount), 0)
  return account.openingBalance + delta
}

export async function computeAllAccountBalances(): Promise<Map<string, number>> {
  const [accounts, transactions] = await Promise.all([prisma.account.findMany(), prisma.transaction.findMany()])

  const balances = new Map<string, number>()
  for (const account of accounts) balances.set(account.id, account.openingBalance)

  for (const t of transactions) {
    const current = balances.get(t.accountId) ?? 0
    balances.set(t.accountId, t.type === "income" ? current + t.netAmount : current - t.grossAmount)
  }

  return balances
}
