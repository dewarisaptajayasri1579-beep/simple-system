import { NextResponse } from "next/server"

import { handleMarketingWhatsappWebhook } from "@/lib/marketing/whatsapp-webhook"

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")
  const session = searchParams.get("session")

  if (secret !== process.env.WAHUB_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Secret tidak valid" }, { status: 401 })
  }
  if (!session) {
    return NextResponse.json({ error: "Query param 'session' wajib diisi" }, { status: 400 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 })

  const result = await handleMarketingWhatsappWebhook(session, payload)
  return NextResponse.json(result)
}
