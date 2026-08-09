import { AppLayout } from "@/components/layout/AppLayout"
import { KasKeluarPanel } from "@/components/keuangan/KasKeluarPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganKasKeluarPage() {
  const user = await getCurrentUser()

  const [accounts, domains, servers, maintenances] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.domain.findMany({ where: { sellPrice: { gt: 0 } }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.server.findMany({ where: { price: { gt: 0 } }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.maintenance.findMany({ where: { price: { gt: 0 } }, include: { client: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <KasKeluarPanel
        accounts={accounts}
        domains={domains.map((d) => ({ id: d.id, name: d.name, price: d.sellPrice, clientName: d.client?.name ?? null }))}
        servers={servers.map((s) => ({ id: s.id, name: s.name, price: s.price, clientName: s.client?.name ?? null }))}
        maintenances={maintenances.map((m) => ({ id: m.id, name: m.name, price: m.price, clientName: m.client?.name ?? null }))}
        isOwner={user.role === "owner"}
      />
    </AppLayout>
  )
}
