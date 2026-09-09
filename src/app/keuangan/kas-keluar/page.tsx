import { AppLayout } from "@/components/layout/AppLayout"
import { KasKeluarPanel } from "@/components/keuangan/KasKeluarPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KeuanganKasKeluarPage() {
  const user = await getCurrentUser()

  // domains/servers/maintenances/recurringBills di sini cuma buat resolve nama di kolom
  // Keterangan Riwayat (lihat KasKeluarPanel) — form input-nya sendiri sudah pindah ke
  // /keuangan/kas-keluar/baru.
  const [domains, servers, maintenances, recurringBills] = await Promise.all([
    prisma.domain.findMany({ where: { active: true }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.server.findMany({ where: { active: true }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.maintenance.findMany({ where: { active: true }, include: { client: true }, orderBy: { name: "asc" } }),
    prisma.recurringBill.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <KasKeluarPanel
        domains={domains.map((d) => ({ id: d.id, name: d.name, price: d.sellPrice, clientName: d.client?.name ?? null }))}
        servers={servers.map((s) => ({ id: s.id, name: s.name, price: s.price, clientName: s.client?.name ?? null }))}
        maintenances={maintenances.map((m) => ({ id: m.id, name: m.name, price: m.price, clientName: m.client?.name ?? null }))}
        recurringBills={recurringBills.map((b) => ({ id: b.id, name: b.name, price: b.price, clientName: null }))}
      />
    </AppLayout>
  )
}
