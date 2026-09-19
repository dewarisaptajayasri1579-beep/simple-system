import { exec } from "node:child_process"
import { promisify } from "node:util"
import { NextResponse } from "next/server"

import { getApiUser } from "@/lib/current-user"
import { canViewMonitoring, parseDfLine, type DiskUsage } from "@/lib/monitoring"

const execAsync = promisify(exec)

/** IP publik server ini sendiri — tidak ada cara baca ini langsung dari OS (container Coolify
 *  biasanya di belakang NAT, IP internal beda dari IP publik VPS-nya), jadi dicek lewat layanan
 *  eksternal ipify. Dipakai buat nampilin "Server Ini" konsisten dengan kartu VPS lain yang juga
 *  nampilin host/IP (lihat kartu "Server Ini" di modul Monitoring Server). */
async function getPublicIp(): Promise<{ ip: string | null; error: string | null }> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { ip: null, error: "Gagal ambil IP publik" }
    const data = await res.json()
    return typeof data?.ip === "string" ? { ip: data.ip, error: null } : { ip: null, error: "Gagal ambil IP publik" }
  } catch {
    return { ip: null, error: "Gagal ambil IP publik" }
  }
}

/** Dijalankan langsung di server app ini sendiri (bukan SSH remote) — lihat catatan di
 *  lib/monitoring.ts kalau app pindah ke server terpisah dari yang mau dipantau, ini perlu
 *  diganti jadi exec via SSH (lihat src/lib/monitoring/ssh.ts, dipakai untuk VPS lain). */
export async function GET() {
  const user = await getApiUser()
  if (!user) return NextResponse.json({ error: "Belum login" }, { status: 401 })
  if (!canViewMonitoring(user)) return NextResponse.json({ error: "Tidak punya akses modul Monitoring" }, { status: 403 })

  const ipPromise = getPublicIp()

  let disk: DiskUsage | null = null
  let diskError: string | null = null
  try {
    const { stdout } = await execAsync("df -kP /", { timeout: 5000 })
    const line = stdout.trim().split("\n")[1] ?? ""
    disk = parseDfLine(line)
  } catch {
    diskError = "Gagal membaca disk usage server (perintah df gagal)"
  }

  const { ip, error: ipError } = await ipPromise

  return NextResponse.json({ disk, diskError, ip, ipError })
}
