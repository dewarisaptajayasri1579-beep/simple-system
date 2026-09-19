import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { listBackupHistory } from "@/lib/backup/r2"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  try {
    const groups = await listBackupHistory(10)
    return NextResponse.json({ groups })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal mengambil riwayat backup" }, { status: 500 })
  }
}
