import { getCurrentUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { LeadListClient } from "@/components/marketing/LeadListClient"

export default async function MarketingLeadPotensialPage() {
  const user = await getCurrentUser("marketing")
  const role = await resolveMarketingRole(user.id, user.role)

  // Lead hasil pemilahan manual Tim (Lead.potentialAt terisi) — lead-nya TETAP muncul di daftar
  // Lead biasa, menu ini cuma pandangan tersaringnya. Lihat api/.../potential/route.ts.
  return <LeadListClient isSales={role === "SALES"} potentialOnly title="Lead Potensial" />
}
