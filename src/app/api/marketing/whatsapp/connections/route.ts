import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { marketingWhatsappWebhookUrl, newWahubSessionId } from "@/lib/marketing/whatsapp-connection"
import { prisma } from "@/lib/prisma"
import { getWahubSessionStatus, startWahubSession } from "@/lib/wahub"

/** List semua koneksi WA milik Sales yang sedang login — sinkron status ke DB tiap dipanggil
 *  (per koneksi) supaya UI lain (mis. badge di header) bisa baca dari DB tanpa hit WAHUB langsung. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const connections = await prisma.whatsappConnection.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  })

  const updated = await Promise.all(
    connections.map(async (connection) => {
      try {
        const remote = await getWahubSessionStatus(connection.wahubSessionId)
        const status = remote?.status ? remote.status.toUpperCase() : "DISCONNECTED"
        return prisma.whatsappConnection.update({
          where: { id: connection.id },
          data: {
            status,
            phoneNumber: status === "READY" ? (remote?.phoneNumber ?? connection.phoneNumber) : connection.phoneNumber,
            lastStatusCheckAt: new Date(),
            lastConnectedAt: status === "READY" ? new Date() : connection.lastConnectedAt,
          },
        })
      } catch {
        return connection
      }
    })
  )

  return NextResponse.json({ connections: updated })
}

/** Tambah koneksi WA baru untuk Sales yang sedang login. Body wajib: { label } — identitas
 *  nomor ini, dipakai buat bedain lead yang masuk lewat nomor mana di UI. */
export async function POST(req: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const label: string | null = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : null
  if (!label) return NextResponse.json({ error: "Nama/identitas nomor wajib diisi" }, { status: 400 })

  const sessionId = newWahubSessionId(user.id)
  const webhookUrl = marketingWhatsappWebhookUrl(sessionId)

  try {
    await startWahubSession(sessionId, webhookUrl)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Gagal memulai koneksi" }, { status: 502 })
  }

  const connection = await prisma.whatsappConnection.create({
    data: { userId: user.id, wahubSessionId: sessionId, label, status: "STARTING" },
  })

  return NextResponse.json(connection)
}
