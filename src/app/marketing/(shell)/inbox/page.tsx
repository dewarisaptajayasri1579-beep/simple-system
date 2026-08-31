import { getCurrentUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { InboxClient } from "@/components/marketing/InboxClient"

export default async function MarketingInboxPage() {
  const user = await getCurrentUser("marketing")
  const role = await resolveMarketingRole(user.id, user.role)

  // Sales cuma boleh lihat Inbox miliknya sendiri (lead yang PIC-nya dia) — beda dari
  // Manager/SPV yang tetap lihat semua (transparansi tim, lihat permissions.ts). Enforcement
  // aslinya di server (GET /api/marketing/conversations), ini cuma nentuin scope awal & apakah
  // toggle "Semua"/"Punya Saya" ditampilkan sama sekali.
  return <InboxClient isSales={role === "SALES"} />
}
