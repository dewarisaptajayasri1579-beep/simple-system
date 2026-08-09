import { AppLayout } from "@/components/layout/AppLayout"
import { BillHistoryPanel } from "@/components/keuangan/BillHistoryPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganServerPage() {
  const user = await getCurrentUser()

  const [accounts, servers] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.server.findMany({
      where: { price: { gt: 0 } },
      include: { client: true },
      orderBy: { name: "asc" },
    }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <BillHistoryPanel
        kind="server"
        title="Bayar Server"
        itemLabel="Server"
        items={servers.map((s) => ({ id: s.id, name: s.name, price: s.price, clientName: s.client?.name ?? null }))}
        accounts={accounts}
        isOwner={user.role === "owner"}
      />
    </AppLayout>
  )
}
