import { getCurrentUser } from "@/lib/current-user"
import { MonitoringDashboard } from "@/components/monitoring/MonitoringDashboard"

export default async function MonitoringPage() {
  const user = await getCurrentUser("monitoring")

  return <MonitoringDashboard isOwner={user.role === "owner"} />
}
