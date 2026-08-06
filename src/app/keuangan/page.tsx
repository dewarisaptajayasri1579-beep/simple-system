import { AppLayout } from "@/components/layout/AppLayout"
import { KeuanganPanel } from "@/components/keuangan/KeuanganPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"
import { computeAllAccountBalances } from "@/lib/account-balance"

export default async function KeuanganPage() {
  const user = await getCurrentUser()

  const [accounts, transactions, balances] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      include: { account: true, category: true },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    computeAllAccountBalances(),
  ])

  const accountRows = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    bankName: a.bankName,
    balance: balances.get(a.id) ?? a.openingBalance,
  }))

  const transactionRows = transactions.map((t) => ({
    id: t.id,
    type: t.type,
    accountName: t.account.name,
    categoryName: t.category?.name ?? null,
    grossAmount: t.grossAmount,
    netAmount: t.netAmount,
    description: t.description,
    occurredAt: t.occurredAt.toISOString(),
  }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Keuangan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Kas &amp; Bank, pengeluaran kantor, dan pemasukan manual.</p>
        </div>

        <KeuanganPanel accounts={accountRows} transactions={transactionRows} />
      </div>
    </AppLayout>
  )
}
