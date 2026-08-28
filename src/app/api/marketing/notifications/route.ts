import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/** GET — notifikasi milik user + `unreadCount`. `?page=` & `?limit=` (default 50, maks 100).
 *  POST — tandai dibaca: body `{ id }` atau `{ all: true }`. */
export async function GET(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50))

  const [rows, unreadCount, total] = await Promise.all([
    prisma.leadNotification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, type: true, title: true, body: true, deepLink: true, readAt: true, createdAt: true },
    }),
    prisma.leadNotification.count({ where: { userId: user.id, readAt: null } }),
    prisma.leadNotification.count({ where: { userId: user.id } }),
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
    page,
    hasMore: page * limit < total,
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
