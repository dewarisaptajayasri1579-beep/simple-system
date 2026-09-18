import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { syncCoolifyApplications } from "@/lib/monitoring/coolify"
import { prisma } from "@/lib/prisma"

/** Trigger sync aplikasi dari Coolify API on-demand untuk satu VPS — cuma Owner. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa sync Coolify" }, { status: 403 })

  const { id } = await params
  const vps = await prisma.vpsServer.findUnique({ where: { id } })
  if (!vps) return NextResponse.json({ error: "VPS tidak ditemukan" }, { status: 404 })
  if (!vps.coolifyApiUrl || !vps.coolifyApiToken) {
    return NextResponse.json({ error: "VPS ini belum diisi Coolify API URL/token" }, { status: 400 })
  }

  try {
    const result = await syncCoolifyApplications(vps)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal sync dari Coolify" }, { status: 500 })
  }
}
