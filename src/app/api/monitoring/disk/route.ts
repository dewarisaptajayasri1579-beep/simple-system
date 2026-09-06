import { exec } from "node:child_process"
import { promisify } from "node:util"
import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring, formatBytes } from "@/lib/monitoring"

const execAsync = promisify(exec)

/** Parse baris kedua output `df -kP /` (POSIX, 1024-byte blocks — portabel Linux & macOS):
 *  "Filesystem 1024-blocks Used Available Capacity Mounted-on". Dijalankan langsung di server
 *  app ini sendiri (bukan SSH remote) — lihat catatan di lib/monitoring.ts kalau app pindah ke
 *  server terpisah dari yang mau dipantau, ini perlu diganti jadi exec via SSH. */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  try {
    const { stdout } = await execAsync("df -kP /", { timeout: 5000 })
    const line = stdout.trim().split("\n")[1] ?? ""
    const cols = line.trim().split(/\s+/)
    const totalKb = Number(cols[1])
    const usedKb = Number(cols[2])
    const availableKb = Number(cols[3])
    if (!Number.isFinite(totalKb) || !Number.isFinite(usedKb) || !Number.isFinite(availableKb)) {
      throw new Error("Format output df tidak dikenali")
    }
    const totalBytes = totalKb * 1024
    const usedBytes = usedKb * 1024
    const availableBytes = availableKb * 1024
    const usedPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0

    return NextResponse.json({
      totalBytes,
      usedBytes,
      availableBytes,
      usedPct,
      totalPretty: formatBytes(totalBytes),
      usedPretty: formatBytes(usedBytes),
      availablePretty: formatBytes(availableBytes),
    })
  } catch {
    return NextResponse.json({ error: "Gagal membaca disk usage server (perintah df gagal)" }, { status: 500 })
  }
}
