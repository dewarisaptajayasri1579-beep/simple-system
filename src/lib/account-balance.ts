import { prisma } from "@/lib/prisma"

/** Saldo dihitung on-the-fly (bukan kolom berjalan) supaya tidak ada risiko saldo "nyeleneh"
 *  akibat bug — selalu direkonstruksi dari openingBalance + transaksi + Pindah Buku. */
export async function computeAccountBalance(accountId: string): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
  const [transactions, transfersOut, transfersIn] = await Promise.all([
    prisma.transaction.findMany({ where: { accountId, postStatus: "posted" } }),
    prisma.accountTransfer.findMany({ where: { sourceAccountId: accountId, postStatus: "posted" } }),
    prisma.accountTransfer.findMany({ where: { destinationAccountId: accountId, postStatus: "posted" } }),
  ])

  const delta = transactions.reduce((sum, t) => (t.type === "income" ? sum + t.netAmount : sum - t.grossAmount), 0)
  const transferDelta =
    transfersIn.reduce((sum, t) => sum + t.amount, 0) - transfersOut.reduce((sum, t) => sum + t.amount, 0)
  return account.openingBalance + delta + transferDelta
}

export async function computeAllAccountBalances(): Promise<Map<string, number>> {
  const [accounts, transactions, transfers] = await Promise.all([
    prisma.account.findMany(),
    prisma.transaction.findMany({ where: { postStatus: "posted" } }),
    prisma.accountTransfer.findMany({ where: { postStatus: "posted" } }),
  ])

  const balances = new Map<string, number>()
  for (const account of accounts) balances.set(account.id, account.openingBalance)

  for (const t of transactions) {
    const current = balances.get(t.accountId) ?? 0
    balances.set(t.accountId, t.type === "income" ? current + t.netAmount : current - t.grossAmount)
  }

  for (const t of transfers) {
    const source = balances.get(t.sourceAccountId) ?? 0
    balances.set(t.sourceAccountId, source - t.amount)
    const destination = balances.get(t.destinationAccountId) ?? 0
    balances.set(t.destinationAccountId, destination + t.amount)
  }

  return balances
}
