import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"
import { getApiUser } from "@/lib/current-user"

function hasAccess(user: { role: string; modules: string[] }) {
  return user.role === "owner" || user.modules.includes("administratif")
}

// Toggle status outstanding/lunas manual — v1 tidak auto-hitung dari potongan gaji
// (lihat catatan di kasbon/route.ts).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!hasAccess(user)) return NextResponse.json({ error: "Tidak punya akses" }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  const status = body?.status === "lunas" ? "lunas" : body?.status === "outstanding" ? "outstanding" : null
  if (!status) return NextResponse.json({ error: "Status tidak valid" }, { status: 400 })

  const kasbon = await prisma.employeeKasbon.update({ where: { id }, data: { status } })
  return NextResponse.json({ kasbon })
}
