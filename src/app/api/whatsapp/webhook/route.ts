import { NextResponse } from "next/server"

import { handleWhatsappWebhook } from "@/lib/whatsapp-webhook"

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")

  if (secret !== process.env.WAHUB_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Secret tidak valid" }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload) return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 })

  const result = await handleWhatsappWebhook(payload)
  return NextResponse.json(result)
}
