import { requireMetaAdsUser } from "@/lib/meta-ads/access"
import { MetaAdsShell } from "@/components/meta-ads/MetaAdsShell"

export default async function MetaAdsShellLayout({ children }: { children: React.ReactNode }) {
  const user = await requireMetaAdsUser()

  return (
    <MetaAdsShell userName={user.name} userRole={user.role}>
      {children}
    </MetaAdsShell>
  )
}
