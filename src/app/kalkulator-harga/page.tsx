import { AppLayout } from "@/components/layout/AppLayout"
import { KalkulatorHargaPanel } from "@/components/kalkulator-harga/KalkulatorHargaPanel"
import { Alert } from "@/components/ui"
import { getCurrentUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export default async function KalkulatorHargaPage() {
  const user = await getCurrentUser()

  const items = await prisma.workPriceItem.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  })

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Kalkulator Harga Pekerjaan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Hitung estimasi harga untuk request custom pekerjaan dari client — tambahkan beberapa jenis pekerjaan sekaligus.
          </p>
        </div>

        {items.length === 0 ? (
          <Alert variant="warning">Belum ada data pricelist pekerjaan.</Alert>
        ) : (
          <KalkulatorHargaPanel
            items={items.map((i) => ({ id: i.id, groupName: i.groupName, level: i.level, label: i.label, price: i.price }))}
          />
        )}
      </div>
    </AppLayout>
  )
}
