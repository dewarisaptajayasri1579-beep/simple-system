import { AppLayout } from "@/components/layout/AppLayout"
import { AcuanLevelTabs } from "@/components/kalkulator-harga/AcuanLevelTabs"
import { Alert } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function AcuanLevelPage() {
  const user = await getCurrentUser()

  const items = await prisma.workPriceItem.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Acuan Level</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Rubrik bobot yang dipakai menghitung harga, beserta contoh pekerjaan yang sudah dikalibrasi.
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
            canEdit={["owner", "admin", "direktur"].includes(user.role)}
          />
        )}
      </div>
    </AppLayout>
  )
}
