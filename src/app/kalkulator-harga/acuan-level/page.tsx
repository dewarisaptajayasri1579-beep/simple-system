import { AppLayout } from "@/components/layout/AppLayout"
import { AcuanLevelTabs } from "@/components/kalkulator-harga/AcuanLevelTabs"
import type { SimulasiRow } from "@/components/kalkulator-harga/SimulasiPanel"
import { Alert } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Simulasi terus bertambah tiap dipakai staf — dibatasi yang terbaru saja supaya halaman tidak
 *  makin berat seiring waktu. */
const SIMULATION_LIMIT = 50

export default async function AcuanLevelPage() {
  const user = await getCurrentUser()

  const [items, simulations] = await Promise.all([
    prisma.workPriceItem.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.workPriceSimulation.findMany({
      orderBy: { createdAt: "desc" },
      take: SIMULATION_LIMIT,
      include: { items: { orderBy: { sortOrder: "asc" } } },
    }),
  ])

  // Nama pembuat diambil sekali untuk semua simulasi (bukan query per baris).
  const creatorIds = [...new Set(simulations.map((s) => s.createdById).filter((id): id is string => !!id))]
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
    : []
  const creatorById = new Map(creators.map((c) => [c.id, c.name]))

  const simulationRows: SimulasiRow[] = simulations.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    clientName: s.clientName,
    totalPoints: s.totalPoints,
    totalPrice: s.totalPrice,
    createdAtIso: s.createdAt.toISOString(),
    createdByName: s.createdById ? (creatorById.get(s.createdById) ?? null) : null,
    items: s.items.map((it) => ({
      id: it.id,
      nama: it.nama,
      qty: it.qty,
      points: it.points,
      unitPrice: it.unitPrice,
      reason: it.reason,
      scores: (it.scores ?? {}) as Record<string, string>,
    })),
  }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Acuan Level</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Rubrik bobot yang dipakai menghitung harga, contoh pekerjaan terkalibrasi, dan riwayat simulasi.
          </p>
        </div>

        {items.length === 0 ? (
          <Alert variant="warning">Belum ada data pricelist pekerjaan.</Alert>
        ) : (
          <AcuanLevelTabs
            items={items.map((i) => ({
              id: i.id,
              groupName: i.groupName,
              level: i.level,
              label: i.label,
              description: i.description,
              price: i.price,
              weightPoints: i.weightPoints,
            }))}
            simulations={simulationRows}
            canEdit={["owner", "admin", "direktur"].includes(user.role)}
          />
        )}
      </div>
    </AppLayout>
  )
}
