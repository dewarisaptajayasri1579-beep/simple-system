import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"
import { getWahubSessionStatus } from "@/lib/wahub"

/** Poll status koneksi WA milik Sales yang sedang login — sinkron ke DB tiap dipanggil supaya
 *  UI lain (mis. badge di header) bisa baca dari DB tanpa perlu hit WAHUB langsung. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const connection = await prisma.whatsappConnection.findUnique({ where: { userId: user.id } })
  if (!connection) return NextResponse.json({ connection: null })

  try {
    const remote = await getWahubSessionStatus(connection.wahubSessionId)
    const status = remote?.status ? remote.status.toUpperCase() : "DISCONNECTED"

    const updated = await prisma.whatsappConnection.update({
      where: { id: connection.id },
      data: {
        status,
        lastStatusCheckAt: new Date(),
        lastConnectedAt: status === "READY" ? new Date() : connection.lastConnectedAt,
      },
    })
    return NextResponse.json({ connection: updated })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal menghubungi WAHUB" }, { status: 502 })
  }
}
