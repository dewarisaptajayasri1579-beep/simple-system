import { AppLayout } from "@/components/layout/AppLayout"
import { KasKeluarNewPagePanel } from "@/components/keuangan/KasKeluarNewPagePanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganKasKeluarBaruPage() {
  const user = await getCurrentUser()

  // Sama dengan kas-keluar/page.tsx — lihat komentar di sana soal kenapa TIDAK difilter by
  // price/sellPrice > 0.
  const [accounts, domains, servers, maintenances, recurringBills] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.domain.findMany({ where: { active: true }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.server.findMany({ where: { active: true }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.maintenance.findMany({ where: { active: true }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.recurringBill.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <KasKeluarNewPagePanel
        accounts={accounts}
        domains={domains.map((d) => ({ id: d.id, name: d.name, price: d.sellPrice, clientName: d.client?.name ?? null }))}
        servers={servers.map((s) => ({ id: s.id, name: s.name, price: s.price, clientName: s.client?.name ?? null }))}
        maintenances={maintenances.map((m) => ({ id: m.id, name: m.name, price: m.price, clientName: m.client?.name ?? null }))}
        recurringBills={recurringBills.map((b) => ({ id: b.id, name: b.name, price: b.price, clientName: null }))}
        isOwner={user.role === "owner"}
      />
    </AppLayout>
  )
}
