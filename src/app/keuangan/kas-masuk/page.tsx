import { AppLayout } from "@/components/layout/AppLayout"
import { CashTransactionHistoryPanel } from "@/components/keuangan/CashTransactionHistoryPanel"
import { requirePageRole } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganKasMasukPage() {
  // Admin dibatasi cuma Kas Keluar (lihat diskusi role Admin) — Kas Masuk tetap Owner+Direktur.
  const user = await requirePageRole(["owner", "direktur"])
  const accounts = await prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <CashTransactionHistoryPanel type="income" title="Kas Masuk" accounts={accounts} />
    </AppLayout>
  )
}
