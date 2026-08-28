import { ConversationView } from "@/components/marketing/ConversationView"

export default async function MarketingConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  return <ConversationView conversationId={conversationId} />
}
