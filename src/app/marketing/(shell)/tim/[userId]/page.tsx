import { MemberDetail } from "@/components/marketing/MemberDetail"

export default async function MarketingMemberPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  return <MemberDetail userId={userId} />
}
