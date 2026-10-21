import { AppLayout } from "@/components/layout/AppLayout"
import { KategoriLevelPanel, type KategoriLevelRow, type PricelistKandidat } from "@/components/blesscom/KategoriLevelPanel"
import { blesscomLevelName } from "@/lib/blesscom-work-level"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KategoriLevelBlesscomPage() {
  const user = await getCurrentUser()

  const items = await prisma.workPriceItem.findMany({
    where: { active: true },
    orderBy: [{ groupName: "asc" }, { sortOrder: "asc" }],
    select: { id: true, groupName: true, level: true, label: true, description: true, blesscomPrice: true },
  })

  const blesscomItems = items.filter((i) => i.blesscomPrice !== null)

  // Berapa kali tiap level sudah dipakai di transaksi pekerjaan — satu groupBy untuk semua baris,
  // bukan query per level.
  const pemakaian = await prisma.blesscomWorkOrderItem.groupBy({
    by: ["workPriceItemId"],
    where: { workPriceItemId: { in: blesscomItems.map((i) => i.id) } },
    _count: { _all: true },
  })
  const usedById = new Map(pemakaian.map((p) => [p.workPriceItemId, p._count._all]))

  const rows: KategoriLevelRow[] = blesscomItems.map((i) => ({
    id: i.id,
    categoryName: i.groupName,
    levelName: blesscomLevelName(i),
    description: i.description,
    price: i.blesscomPrice as number,
    usedCount: usedById.get(i.id) ?? 0,
  }))

  // Level pricelist umum yang belum punya harga Blesscom — ditawarkan buat dimasukkan ke daftar
  // supaya tidak dibuat baris kembar untuk level yang sebenarnya sudah ada.
  const kandidat: PricelistKandidat[] = items
    .filter((i) => i.blesscomPrice === null)
    .map((i) => ({ id: i.id, label: `${i.groupName} — ${blesscomLevelName(i)}` }))

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Kategori &amp; Level Pekerjaan
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Daftar kategori, level, dan harga kesepakatan Blesscom — acuan harga di menu Daftar Pekerjaan.
          </p>
        </div>

        <KategoriLevelPanel
          rows={rows}
          kandidat={kandidat}
          // Sejajar dengan API-nya: admin boleh membaca acuan harga, tapi tidak mengubahnya.
          canEdit={["owner", "direktur"].includes(user.role)}
        />
      </div>
    </AppLayout>
  )
}
