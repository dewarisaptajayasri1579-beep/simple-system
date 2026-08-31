import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { marketingWhatsappWebhookUrl } from "@/lib/marketing/whatsapp-connection"
import { prisma } from "@/lib/prisma"
import { startWahubSession } from "@/lib/wahub"

/** Mulai ulang session WAHUB untuk koneksi yang sudah ada (mis. setelah QR expired / gagal). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const connection = await prisma.whatsappConnection.findUnique({ where: { id } })
  if (!connection || connection.userId !== user.id) {
    return NextResponse.json({ error: "Koneksi tidak ditemukan" }, { status: 404 })
  }

  const webhookUrl = marketingWhatsappWebhookUrl(connection.wahubSessionId)

  try {
    await startWahubSession(connection.wahubSessionId, webhookUrl)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memulai koneksi" }, { status: 502 })
  }

  const updated = await prisma.whatsappConnection.update({
    where: { id: connection.id },
    data: { status: "STARTING" },
  })

  return NextResponse.json(updated)
}
