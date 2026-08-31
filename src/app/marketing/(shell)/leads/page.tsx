import { getCurrentUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { LeadListClient } from "@/components/marketing/LeadListClient"

export default async function MarketingLeadsPage() {
  const user = await getCurrentUser("marketing")
  const role = await resolveMarketingRole(user.id, user.role)

  // Sales cuma boleh lihat lead miliknya sendiri — enforcement aslinya di server
  // (GET /api/marketing/leads), ini cuma nentuin scope awal & apakah toggle "Semua Tim"
  // ditampilkan sama sekali (lihat InboxClient.tsx untuk pola yang sama).
  return <LeadListClient isSales={role === "SALES"} />
}
