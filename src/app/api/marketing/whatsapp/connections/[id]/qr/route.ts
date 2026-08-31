import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"
import { getWahubSessionQrDataUrl } from "@/lib/wahub"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const connection = await prisma.whatsappConnection.findUnique({ where: { id } })
  if (!connection || connection.userId !== user.id) {
    return NextResponse.json({ error: "Koneksi tidak ditemukan" }, { status: 404 })
  }

  try {
    const qrDataUrl = await getWahubSessionQrDataUrl(connection.wahubSessionId)
    if (!qrDataUrl) return NextResponse.json({ qrDataUrl: null })
    return NextResponse.json({ qrDataUrl })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghubungi WAHUB" }, { status: 502 })
  }
}
