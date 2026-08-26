import { getCurrentUser } from "@/lib/current-user"
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder"

export default async function MarketingPage() {
  await getCurrentUser("marketing")

  return (
    <ModulePlaceholder
      moduleTitle="Marketing (Kelola Lead)"
      description="Fitur pengelolaan lead sedang dikembangkan — segera hadir."
      action={{ href: "/marketing/whatsapp", label: "Hubungkan WhatsApp" }}
    />
  )
}
