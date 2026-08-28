import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/** GET — 50 notifikasi terbaru milik user + `unreadCount`.
 *  POST — tandai dibaca: body `{ id }` atau `{ all: true }`. */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const [rows, unreadCount] = await Promise.all([
    prisma.leadNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, title: true, body: true, deepLink: true, readAt: true, createdAt: true },
    }),
    prisma.leadNotification.count({ where: { userId: user.id, readAt: null } }),
  ])

  return NextResponse.json({
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      deepLink: n.deepLink,
      read: n.readAt != null,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  })
}

export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { id?: unknown; all?: unknown } | null
  const now = new Date()

  if (body?.all === true) {
    await prisma.leadNotification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: now, status: "READ" },
    })
    return NextResponse.json({ ok: true })
  }

  if (typeof body?.id === "string") {
    await prisma.leadNotification.updateMany({
      where: { id: body.id, userId: user.id },
      data: { readAt: now, status: "READ" },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Kirim { id } atau { all: true }" }, { status: 400 })
}
