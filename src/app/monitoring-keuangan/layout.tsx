import { AppLayout } from "@/components/layout/AppLayout"
import { MonitoringKeuanganTabs } from "@/components/monitoring-keuangan/MonitoringKeuanganTabs"
import { requirePageRole } from "@/lib/current-user"

export default async function MonitoringKeuanganLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole(["owner", "admin"])

  return (
    <AppLayout userName={user.name} userRole={user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Monitoring Keuangan</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1">Rekap uang masuk dan uang keluar dari Domain, Server, Maintenance, dan Proyek.</p>
        </div>
        <MonitoringKeuanganTabs />
        {children}
      </div>
    </AppLayout>
  )
}
