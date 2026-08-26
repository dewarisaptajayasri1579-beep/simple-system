import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"
import { getWahubSessionQrDataUrl } from "@/lib/wahub"

export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const connection = await prisma.whatsappConnection.findUnique({ where: { userId: user.id } })
  if (!connection) return NextResponse.json({ error: "Belum ada koneksi — mulai dulu lewat /connect" }, { status: 404 })

  try {
    const qrDataUrl = await getWahubSessionQrDataUrl(connection.wahubSessionId)
    if (!qrDataUrl) return NextResponse.json({ qrDataUrl: null })
    return NextResponse.json({ qrDataUrl })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghubungi WAHUB" }, { status: 502 })
  }
}
