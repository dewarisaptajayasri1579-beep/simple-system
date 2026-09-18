import { Client } from "ssh2"

import { parseDfLine, type DiskUsage } from "@/lib/monitoring"

export type SshCreds = {
  host: string
  port: number
  username: string
  password?: string | null
  privateKey?: string | null
}

export type VpsSshLike = {
  host: string
  sshPort: number
  sshUser: string
  sshPassword: string | null
  sshPrivateKey: string | null
}

export function vpsSshCreds(vps: VpsSshLike): SshCreds {
  return { host: vps.host, port: vps.sshPort, username: vps.sshUser, password: vps.sshPassword, privateKey: vps.sshPrivateKey }
}

/** Escape aman buat dipakai di dalam single-quote shell — dipakai karena path (diskPath,
 *  backupCheckPath) disimpan sebagai teks bebas oleh owner, bukan sesuatu yang kita percaya
 *  100% bebas karakter spesial shell. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Buka 1 koneksi SSH, jalankan 1 command (bisa multi-baris/gabungan), kembalikan stdout.
 *  Reject kalau connect gagal atau timeout. Dipakai untuk semua cek VPS remote (disk, backup,
 *  log akses Traefik) — SATU koneksi per pemanggilan supaya tidak buka-tutup SSH berkali-kali. */
export function sshExec(creds: SshCreds, command: string, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      conn.end()
      reject(new Error("Timeout koneksi SSH"))
    }, timeoutMs)

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) return finish(() => { conn.end(); reject(err) })
          let stdout = ""
          let stderr = ""
          stream
            .on("close", (code: number) => {
              finish(() => {
                conn.end()
                if (code !== 0 && !stdout.trim()) reject(new Error(stderr.trim() || `Perintah SSH keluar dengan kode ${code}`))
                else resolve(stdout)
              })
            })
            .on("data", (d: Buffer) => { stdout += d.toString() })
          stream.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
        })
      })
      .on("error", (err) => finish(() => reject(err)))
      .connect({
        host: creds.host,
        port: creds.port,
        username: creds.username,
        password: creds.password || undefined,
        privateKey: creds.privateKey || undefined,
        readyTimeout: timeoutMs,
      })
  })
}

export type VpsLiveCheck = {
  disk: DiskUsage | null
  diskError: string | null
  backupLatestFile: string | null
  backupLatestAt: string | null
  backupError: string | null
}

const DELIM = "___SPLIT___"

export type VpsLiveCheckInput = VpsSshLike & { diskPath: string; backupCheckPath: string | null }

/** 1 koneksi SSH per VPS untuk disk usage + (kalau backupCheckPath diisi) file terbaru di folder
 *  backup itu — digabung jadi 1 command supaya cuma 1 round-trip SSH, bukan 2. Diasumsikan VPS
 *  remote jalan Linux (Coolify jalan di Linux) jadi aman pakai `stat -c` (GNU), beda dari cek
 *  disk lokal (src/app/api/monitoring/disk/route.ts) yang perlu portabel ke macOS untuk dev. */
export async function getVpsDiskAndBackup(vps: VpsLiveCheckInput): Promise<VpsLiveCheck> {
  const creds = vpsSshCreds(vps)
  const diskPathQ = shQuote(vps.diskPath || "/")
  const backupPathQ = vps.backupCheckPath ? shQuote(vps.backupCheckPath) : null

  const script = [
    `df -kP ${diskPathQ} | tail -1`,
    `echo "${DELIM}"`,
    backupPathQ
      ? `f=$(ls -t ${backupPathQ} 2>/dev/null | head -1); if [ -n "$f" ]; then echo "$f"; stat -c %Y ${backupPathQ}/"$f" 2>/dev/null; fi`
      : "",
  ].join("\n")

  let stdout: string
  try {
    stdout = await sshExec(creds, script, 10000)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal SSH ke VPS"
    return { disk: null, diskError: message, backupLatestFile: null, backupLatestAt: null, backupError: vps.backupCheckPath ? message : null }
  }

  const [diskPart, backupPart = ""] = stdout.split(DELIM)

  let disk: DiskUsage | null = null
  let diskError: string | null = null
  try {
    disk = parseDfLine((diskPart.trim().split("\n")[0] ?? ""))
  } catch {
    diskError = "Gagal membaca disk usage VPS (perintah df gagal)"
  }

  let backupLatestFile: string | null = null
  let backupLatestAt: string | null = null
  let backupError: string | null = null
  if (backupPathQ) {
    const lines = backupPart.trim().split("\n").filter(Boolean)
    if (lines.length >= 2) {
      backupLatestFile = lines[0]
      const epoch = Number(lines[1])
      backupLatestAt = Number.isFinite(epoch) ? new Date(epoch * 1000).toISOString() : null
    } else {
      backupError = "Belum ada file ditemukan di folder backup"
    }
  }

  return { disk, diskError, backupLatestFile, backupLatestAt, backupError }
}
