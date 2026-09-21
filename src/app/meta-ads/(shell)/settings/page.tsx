import { redirect } from "next/navigation"

import { requireMetaAdsUser } from "@/lib/meta-ads/access"
import { MetaAdsSettings } from "@/components/meta-ads/MetaAdsSettings"

export default async function MetaAdsSettingsPage() {
  const user = await requireMetaAdsUser()
  if (user.role !== "owner") redirect("/meta-ads")

  return <MetaAdsSettings />
}
