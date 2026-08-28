import { NextResponse } from "next/server"

import { getMarketingApiUser } from "@/lib/marketing/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET  — VAPID public key (buat client `pushManager.subscribe`). Kosong = Web Push belum diaktifkan.
 * POST — simpan/refresh 1 PushSubscription milik user. body: PushSubscriptionJSON + `deviceName?`.
 * DELETE — hapus subscription by `endpoint`.
 * Pengiriman push nyata = Fase 10 (npm i web-push + VAPID_* di env) — lihat `src/lib/marketing/notify.ts`.
 */
export async function GET() {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  return NextResponse.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null })
}

export async function POST(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string }; deviceName?: string }
    | null
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : ""
  if (!endpoint) return NextResponse.json({ error: "endpoint wajib" }, { status: 400 })

  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: user.id,
      p256dh: body?.keys?.p256dh ?? null,
      auth: body?.keys?.auth ?? null,
      deviceName: body?.deviceName ?? null,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId: user.id,
      endpoint,
      p256dh: body?.keys?.p256dh ?? null,
      auth: body?.keys?.auth ?? null,
      deviceName: body?.deviceName ?? null,
    },
  })
  return NextResponse.json({ ok: true, id: sub.id })
}

export async function DELETE(request: Request) {
  const user = await getMarketingApiUser()
  if (!user) return NextResponse.json({ error: "Tidak punya akses modul Marketing" }, { status: 401 })
  const endpoint = new URL(request.url).searchParams.get("endpoint")
  if (!endpoint) return NextResponse.json({ error: "endpoint wajib" }, { status: 400 })
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } })
  return NextResponse.json({ ok: true })
}
