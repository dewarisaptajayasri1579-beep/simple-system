import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { runDashboardReport } from "@/lib/cron/dashboard-report"

/** Trigger manual buat tombol "Kirim ke WA Grup" di Dashboard — kirim 2 gambar laporan yang
 *  sama persis dengan yang dikirim otomatis jam 07:00/16:00 WIB (lihat lib/cron/dashboard-report.ts). */
export async function POST() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })

  try {
    await runDashboardReport("Manual")
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengirim laporan ke WA"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
