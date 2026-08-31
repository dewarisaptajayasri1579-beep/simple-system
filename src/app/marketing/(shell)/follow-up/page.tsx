import { getCurrentUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { FollowUpBoard } from "@/components/marketing/FollowUpBoard"

export default async function MarketingFollowUpPage() {
  const user = await getCurrentUser("marketing")
  const role = await resolveMarketingRole(user.id, user.role)

  // Sales cuma boleh lihat follow up miliknya sendiri — enforcement aslinya di server
  // (GET /api/marketing/follow-ups), ini cuma nentuin scope awal & apakah toggle "Semua Tim"
  // ditampilkan sama sekali (lihat InboxClient.tsx untuk pola yang sama).
  return <FollowUpBoard isSales={role === "SALES"} />
}
