import { NextResponse } from "next/server"

import { runVpsMonitoringRefresh } from "@/lib/cron/vps-monitoring"
import { getApiUser } from "@/lib/current-user"
import { prisma } from "@/lib/prisma"

/** Trigger manual logic cron jam-jaman vps-monitoring (sync Coolify + cek expiry domain RDAP +
 *  cek terakhir diakses + refresh breakdown disk Docker) untuk SATU VPS — cuma Owner, tombol
 *  "Sync & Cek Sekarang" per VPS. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa trigger sync" }, { status: 403 })

  const { id } = await params
  const vps = await prisma.vpsServer.findUnique({ where: { id }, select: { id: true } })
  if (!vps) return NextResponse.json({ error: "VPS tidak ditemukan" }, { status: 404 })

  try {
    const result = await runVpsMonitoringRefresh(id)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menjalankan sync & cek" }, { status: 500 })
  }
}
