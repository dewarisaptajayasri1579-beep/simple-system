import { AppLayout } from "@/components/layout/AppLayout"
import { HitungHargaPanel } from "@/components/kalkulator-harga/HitungHargaPanel"
import { getCurrentUser } from "@/lib/current-user"

export default async function HitungHargaPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Hitung Harga</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Tulis deskripsi pekerjaan request client — AI akan tanya seperlunya, menilai bobotnya, lalu menghitung harganya.
          </p>
        </div>

        <HitungHargaPanel />
      </div>
    </AppLayout>
  )
}
