import { getCurrentUser } from "@/lib/current-user"
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder"

export default async function MonitoringPage() {
  await getCurrentUser("monitoring")

  return <ModulePlaceholder moduleTitle="Monitoring Server" description="Fitur monitoring server sedang dikembangkan — segera hadir." />
}
