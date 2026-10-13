import { AppLayout } from "@/components/layout/AppLayout"
import { PerusahaanPanel, type PerusahaanRow } from "@/components/blesscom/PerusahaanPanel"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function BlesscomPerusahaanPage() {
  const user = await getCurrentUser()

  const [companies, clients] = await Promise.all([
    prisma.principleCompany.findMany({
      orderBy: { name: "asc" },
      include: {
        client: { select: { id: true, name: true } },
        priceTiers: { orderBy: { fromCount: "asc" } },
        _count: { select: { principles: true } },
      },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

  const rows: PerusahaanRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    clientId: c.clientId,
    clientName: c.client?.name ?? null,
    principleCount: c._count.principles,
    tiers: c.priceTiers.map((t) => ({
      id: t.id,
      label: t.label,
      fromCount: t.fromCount,
      toCount: t.toCount,
      unitPrice: t.unitPrice,
    })),
  }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Perusahaan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Blesscom &amp; Blessfull — perusahaan yang tagihan bulanannya dihitung per principle.
          </p>
        </div>

        <PerusahaanPanel
          companies={rows}
          clients={clients}
          canEdit={["owner", "admin", "direktur"].includes(user.role)}
          canEditTier={["owner", "direktur"].includes(user.role)}
        />
      </div>
    </AppLayout>
  )
}
