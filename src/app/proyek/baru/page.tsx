import { AppLayout } from "@/components/layout/AppLayout"
import { ProjectForm } from "@/components/proyek/ProjectForm"
import { getCurrentUser } from "@/lib/current-user"

export default async function NewProjectPage() {
  const user = await getCurrentUser()

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Buat Proyek</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Pilih client, tentukan periode, dan susun jadwal pembayaran (termin).</p>
        </div>
        <ProjectForm />
      </div>
    </AppLayout>
  )
}
