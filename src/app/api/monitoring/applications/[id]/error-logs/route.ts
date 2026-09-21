import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { prisma } from "@/lib/prisma"

/** 50 error log terbaru 1 aplikasi (sudah dikumpulkan cron per jam, lihat
 *  runApplicationErrorLogCollection di src/lib/cron/application-error-logs.ts) — dibaca dari DB,
 *  bukan live SSH, supaya modal "Lihat Detail" cepat dibuka. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const { id } = await params
  const logs = await prisma.applicationErrorLog.findMany({
    where: { applicationId: id },
    orderBy: { occurredAt: "desc" },
    take: 50,
    select: { id: true, message: true, occurredAt: true },
  })
  return NextResponse.json(logs)
}
