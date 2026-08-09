import { AppLayout } from "@/components/layout/AppLayout"
import { BillHistoryPanel } from "@/components/keuangan/BillHistoryPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganDomainPage() {
  const user = await getCurrentUser()

  const [accounts, domains] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.domain.findMany({
      where: { sellPrice: { gt: 0 } },
      include: { client: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <BillHistoryPanel
        kind="domain"
        title="Bayar Domain"
        itemLabel="Domain"
        items={domains.map((d) => ({ id: d.id, name: d.name, price: d.sellPrice, clientName: d.client?.name ?? null }))}
        accounts={accounts}
        isOwner={user.role === "owner"}
      />
    </AppLayout>
  )
}
