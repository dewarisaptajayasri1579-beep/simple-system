/** Bentuk data pesan yang dikirim ke client — dipakai bareng oleh list & detail conversation. */
export function messageDto(m: {
  id: string
  direction: string
  messageType: string
  body: string | null
  mediaUrl: string | null
  senderUserId: string | null
  sentAt: Date
  deliveryStatus: string
}) {
  return {
    id: m.id,
    direction: m.direction,
    messageType: m.messageType,
    body: m.body,
    mediaUrl: m.mediaUrl,
    senderUserId: m.senderUserId,
    sentAt: m.sentAt.toISOString(),
    deliveryStatus: m.deliveryStatus,
  }
}

export const MESSAGE_SELECT = {
  id: true,
  direction: true,
  messageType: true,
  body: true,
  mediaUrl: true,
  senderUserId: true,
  sentAt: true,
  deliveryStatus: true,
} as const

export type MessageDto = ReturnType<typeof messageDto>
