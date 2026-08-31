/** Bentuk data pesan Grup WA yang dikirim ke client — mirror `inbox.ts` (Lead), field beda
 *  karena Grup gak ada `senderExternalId` (WA cuma kasih `senderName`), ada `senderUserId` buat
 *  OUTBOUND dari app ini. */
export function groupMessageDto(m: {
  id: string
  providerMessageId: string | null
  direction: string
  messageType: string
  body: string | null
  mediaUrl: string | null
  senderName: string | null
  senderUserId: string | null
  sentAt: Date
}) {
  return {
    id: m.id,
    providerMessageId: m.providerMessageId,
    direction: m.direction,
    messageType: m.messageType,
    body: m.body,
    mediaUrl: m.mediaUrl,
    senderName: m.senderName,
    senderUserId: m.senderUserId,
    sentAt: m.sentAt.toISOString(),
  }
}

export const GROUP_MESSAGE_SELECT = {
  id: true,
  providerMessageId: true,
  direction: true,
  messageType: true,
  body: true,
  mediaUrl: true,
  senderName: true,
  senderUserId: true,
  sentAt: true,
} as const

export type GroupMessageDto = ReturnType<typeof groupMessageDto>
