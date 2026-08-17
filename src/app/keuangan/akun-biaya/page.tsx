import { AppLayout } from "@/components/layout/AppLayout"
import { CategorySection } from "@/components/keuangan/CategorySection"
import { getCurrentUser } from "@/lib/current-user"

export default async function AkunBiayaPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Akun Biaya</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Kelola kategori Pendapatan, Biaya, dan HPP beserta akun COA-nya.</p>
        </div>
        <CategorySection canEdit={user.role === "owner"} />
      </div>
    </AppLayout>
  )
}
