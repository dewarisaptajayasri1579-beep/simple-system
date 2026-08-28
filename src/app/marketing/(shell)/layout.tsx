import { getCurrentUser } from "@/lib/current-user"
import { resolveMarketingRole } from "@/lib/marketing/permissions"
import { MarketingShell } from "@/components/marketing/MarketingShell"

const ROLE_LABEL: Record<string, string> = { MANAGER: "Manager", SPV: "SPV", SALES: "Sales" }

/** Layout untuk semua halaman "app" modul Marketing (Beranda, Inbox, Lead, dst) — gate akses
 *  modul + bungkus dengan shell (sidebar desktop + bottom-nav mobile). Halaman
 *  `/marketing/whatsapp` sengaja DI LUAR grup ini supaya tetap chrome-less saat onboarding. */
export default async function MarketingShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser("marketing")
  const role = await resolveMarketingRole(user.id, user.role)

  return (
    <MarketingShell userName={user.name} roleLabel={ROLE_LABEL[role] ?? "Sales"}>
      {children}
    </MarketingShell>
  )
}
