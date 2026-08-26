import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { marketingWhatsappWebhookUrl, wahubSessionIdForUser } from "@/lib/marketing/whatsapp-connection"
import { prisma } from "@/lib/prisma"
import { startWahubSession } from "@/lib/wahub"

/** Mulai/refresh koneksi WA milik Sales yang sedang login — idempotent, aman dipanggil ulang
 *  kalau QR sebelumnya kadaluarsa (WAHUB no-op restart kalau session sudah "ready"). */
export async function POST() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sessionId = wahubSessionIdForUser(user.id)
  const webhookUrl = marketingWhatsappWebhookUrl(sessionId)

  try {
    await startWahubSession(sessionId, webhookUrl)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghubungi WAHUB" }, { status: 502 })
  }

  const connection = await prisma.whatsappConnection.upsert({
    where: { userId: user.id },
    update: { wahubSessionId: sessionId, status: "STARTING" },
    create: { userId: user.id, wahubSessionId: sessionId, status: "STARTING" },
  })

  return NextResponse.json(connection)
}
