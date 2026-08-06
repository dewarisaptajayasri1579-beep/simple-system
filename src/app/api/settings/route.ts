import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  })
  return NextResponse.json(settings)
}

export async function PATCH(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa ubah Pengaturan" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const data: Record<string, number | boolean> = {}
  if (typeof body?.operasionalPct === "number") data.operasionalPct = body.operasionalPct
  if (typeof body?.direksiPct === "number") data.direksiPct = body.direksiPct
  if (typeof body?.bonusPct === "number") data.bonusPct = body.bonusPct
  if (typeof body?.defaultPpnRate === "number") data.defaultPpnRate = body.defaultPpnRate
  if (typeof body?.aiFollowUpEnabled === "boolean") data.aiFollowUpEnabled = body.aiFollowUpEnabled

  const total = (Number(data.operasionalPct) || 0) + (Number(data.direksiPct) || 0) + (Number(data.bonusPct) || 0)
  if (data.operasionalPct !== undefined && Math.abs(total - 100) > 0.01) {
    return NextResponse.json({ error: "Total persentase split harus 100%" }, { status: 400 })
  }

  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  })
  return NextResponse.json(settings)
}
