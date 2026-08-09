import { AppLayout } from "@/components/layout/AppLayout"
import { DokumentasiPanel } from "@/components/dokumentasi/DokumentasiPanel"
import { getCurrentUser } from "@/lib/current-user"

export default async function DokumentasiPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dokumentasi</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Alur tiap modul — dari input data sampai ke COA.</p>
        </div>
        <DokumentasiPanel />
      </div>
    </AppLayout>
  )
}
