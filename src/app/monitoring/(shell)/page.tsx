import { getCurrentUser } from "@/lib/current-user"
import { MonitoringDashboard } from "@/components/monitoring/MonitoringDashboard"

export default async function MonitoringPage() {
  const user = await getCurrentUser("monitoring")

  // Sys Administrator setara Owner UNTUK modul Monitoring saja (bisa Tambah VPS, Sync, Bersihkan
  // Docker, dll) — tapi tetap tidak bisa masuk modul Internal/Marketing sama sekali (lihat
  // User.modules & getCurrentUser("monitoring") di atas, itu yang benar-benar ngunci aksesnya).
  return <MonitoringDashboard isOwner={user.role === "owner" || user.role === "sysadmin"} />
}
