import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { triggerDatabaseBackupNow } from "@/lib/monitoring/coolify"
import { prisma } from "@/lib/prisma"

/** Trigger 1 eksekusi backup SEKARANG (bukan tunggu jadwal) buat 1 database Coolify — cuma Owner,
 *  tombol "Backup Sekarang" di monitoring. Lihat triggerDatabaseBackupNow() di
 *  src/lib/monitoring/coolify.ts kenapa ini lewat PATCH jadwal yang sudah ada, bukan endpoint
 *  "run" tersendiri (Coolify REST API tidak punya itu). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; uuid: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa trigger backup" }, { status: 403 })

  const { id, uuid } = await params
  const vps = await prisma.vpsServer.findUnique({ where: { id }, select: { id: true, coolifyApiUrl: true, coolifyApiToken: true } })
  if (!vps) return NextResponse.json({ error: "VPS tidak ditemukan" }, { status: 404 })

  const result = await triggerDatabaseBackupNow(vps, uuid)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })

  return NextResponse.json({ ok: true })
}
