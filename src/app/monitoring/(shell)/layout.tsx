import { getCurrentUser } from "@/lib/current-user"
import { MonitoringShell } from "@/components/monitoring/MonitoringShell"

export default async function MonitoringShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser("monitoring")

  return (
    <MonitoringShell userName={user.name} userRole={user.role}>
      {children}
    </MonitoringShell>
  )
}
