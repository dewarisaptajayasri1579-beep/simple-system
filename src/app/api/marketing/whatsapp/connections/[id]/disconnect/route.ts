import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"
import { logoutWahubSession } from "@/lib/wahub"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const { id } = await params
  const connection = await prisma.whatsappConnection.findUnique({ where: { id } })
  if (!connection || connection.userId !== user.id) {
    return NextResponse.json({ error: "Koneksi tidak ditemukan" }, { status: 404 })
  }

  try {
    await logoutWahubSession(connection.wahubSessionId)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghubungi WAHUB" }, { status: 502 })
  }

  const updated = await prisma.whatsappConnection.update({
    where: { id: connection.id },
    data: { status: "DISCONNECTED", phoneNumber: null },
  })
  return NextResponse.json(updated)
}
