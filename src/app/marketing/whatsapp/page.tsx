import { getCurrentUser } from "@/lib/current-user"
import { ConnectWhatsapp } from "@/components/marketing/ConnectWhatsapp"

export default async function MarketingWhatsappPage() {
  await getCurrentUser("marketing")

  return <ConnectWhatsapp />
}
