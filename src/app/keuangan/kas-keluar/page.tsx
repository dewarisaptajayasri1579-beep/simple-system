import { AppLayout } from "@/components/layout/AppLayout"
import { CashTransactionHistoryPanel } from "@/components/keuangan/CashTransactionHistoryPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganKasKeluarPage() {
  const user = await getCurrentUser()
  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <CashTransactionHistoryPanel type="expense" title="Kas Keluar" accounts={accounts} isOwner={user.role === "owner"} />
    </AppLayout>
  )
}
