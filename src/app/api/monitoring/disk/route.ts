import { exec } from "node:child_process"
import { promisify } from "node:util"
import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring, parseDfLine } from "@/lib/monitoring"

const execAsync = promisify(exec)

/** Dijalankan langsung di server app ini sendiri (bukan SSH remote) — lihat catatan di
 *  lib/monitoring.ts kalau app pindah ke server terpisah dari yang mau dipantau, ini perlu
 *  diganti jadi exec via SSH (lihat src/lib/monitoring/ssh.ts, dipakai untuk VPS lain). */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  try {
    const { stdout } = await execAsync("df -kP /", { timeout: 5000 })
    const line = stdout.trim().split("\n")[1] ?? ""
    return NextResponse.json(parseDfLine(line))
  } catch {
    return NextResponse.json({ error: "Gagal membaca disk usage server (perintah df gagal)" }, { status: 500 })
  }
}
