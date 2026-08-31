import { getCurrentUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { LeadListClient } from "@/components/marketing/LeadListClient"

export default async function MarketingClientLamaPage() {
  const user = await getCurrentUser("marketing")
  const role = await resolveMarketingRole(user.id, user.role)

  // Lead dengan outcome CLIENT_LAMA (nomor lama yang WA lagi, bukan lead baru) dikeluarkan dari
  // daftar Lead biasa (lihat leads/route.ts) dan punya menu sendiri di sini.
  return <LeadListClient isSales={role === "SALES"} forcedOutcome="CLIENT_LAMA" title="Client Lama" />
}
