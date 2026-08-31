import { getCurrentUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { HomeClient } from "@/components/marketing/HomeClient"

export default async function MarketingBerandaPage() {
  const user = await getCurrentUser("marketing")
  const role = await resolveMarketingRole(user.id, user.role)

  // Sales cuma boleh lihat Beranda miliknya sendiri — enforcement aslinya di server
  // (GET /api/marketing/home), ini cuma nentuin scope awal & apakah toggle "Semua Tim"
  // ditampilkan sama sekali (lihat InboxClient.tsx untuk pola yang sama).
  return <HomeClient isSales={role === "SALES"} />
}
