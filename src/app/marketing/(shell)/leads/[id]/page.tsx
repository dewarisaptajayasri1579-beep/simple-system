import { LeadDetailClient } from "@/components/marketing/LeadDetailClient"

export default async function MarketingLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LeadDetailClient leadId={id} />
}
