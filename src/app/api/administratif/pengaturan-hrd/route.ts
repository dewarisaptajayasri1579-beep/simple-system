import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

const DEFAULTS = {
  id: "singleton",
  jamMasuk: "08:00",
  jamPulang: "17:00",
  toleransiJarakM: 100,
  kantorLat: null as number | null,
  kantorLng: null as number | null,
  tglCutoff: 25,
  nominalLembur: 173,
  premiKehadiran: 100000,
}

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const settings = (await prisma.hrSettings.findUnique({ where: { id: "singleton" } })) ?? DEFAULTS
  return NextResponse.json({ settings })
}

export async function PATCH(request: Request) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const body = await request.json().catch(() => null)
  const data: Record<string, unknown> = {}
  if (typeof body?.jamMasuk === "string") data.jamMasuk = body.jamMasuk
  if (typeof body?.jamPulang === "string") data.jamPulang = body.jamPulang
  if (typeof body?.toleransiJarakM === "number") data.toleransiJarakM = body.toleransiJarakM
  if (typeof body?.kantorLat === "number" || body?.kantorLat === null) data.kantorLat = body.kantorLat
  if (typeof body?.kantorLng === "number" || body?.kantorLng === null) data.kantorLng = body.kantorLng
  if (typeof body?.tglCutoff === "number") data.tglCutoff = body.tglCutoff
  if (typeof body?.nominalLembur === "number") data.nominalLembur = body.nominalLembur
  if (typeof body?.premiKehadiran === "number") data.premiKehadiran = body.premiKehadiran

  const settings = await prisma.hrSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...DEFAULTS, ...data },
    update: data,
  })

  return NextResponse.json({ settings })
}
