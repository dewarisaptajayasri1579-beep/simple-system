import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring } from "@/lib/monitoring"
import { listRecentBackups } from "@/lib/backup/google-drive"

export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  try {
    const files = await listRecentBackups(5)
    return NextResponse.json({ files })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal mengambil daftar backup" }, { status: 500 })
  }
}
