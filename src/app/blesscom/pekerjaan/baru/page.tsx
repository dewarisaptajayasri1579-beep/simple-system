import { AppLayout } from "@/components/layout/AppLayout"
import { PekerjaanBlesscomForm } from "@/components/blesscom/PekerjaanBlesscomForm"
import { getBlesscomLevelOptions } from "@/lib/blesscom-level-catalog"
import { getCurrentUser } from "@/lib/current-user"
import { getPrincipleOptions } from "@/lib/blesscom-principle-options"

export default async function PekerjaanBlesscomBaruPage() {
  const user = await getCurrentUser()
  const [principleOptions, levelOptions] = await Promise.all([getPrincipleOptions(), getBlesscomLevelOptions()])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Tambah Transaksi</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Pilih tanggal &amp; principle, lalu isi detail pekerjaan beserta levelnya.
          </p>
        </div>
        <PekerjaanBlesscomForm principleOptions={principleOptions} levelOptions={levelOptions} />
      </div>
    </AppLayout>
  )
}
