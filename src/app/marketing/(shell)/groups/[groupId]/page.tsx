import { GroupChatView } from "@/components/marketing/GroupChatView"

export default async function MarketingGroupChatPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  return <GroupChatView groupId={groupId} />
}
