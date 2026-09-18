import { NextResponse } from "next/server"

import { runVpsMonitoringRefresh } from "@/lib/cron/vps-monitoring"
import { getApiUser } from "@/lib/current-user"

/** Trigger manual logic cron harian vps-monitoring (sync Coolify semua VPS + cek expiry domain
 *  RDAP + cek terakhir diakses lewat log Traefik) — cuma Owner, tombol "Sync & Cek Sekarang". */
export async function POST() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (user.role !== "owner") return NextResponse.json({ error: "Cuma Owner yang bisa trigger sync" }, { status: 403 })

  try {
    const result = await runVpsMonitoringRefresh()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menjalankan sync & cek" }, { status: 500 })
  }
}
