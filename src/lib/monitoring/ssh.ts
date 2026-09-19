import { Client } from "ssh2"

import { decryptSecret } from "@/lib/crypto"
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

/** Dekripsi password/private key di sini — satu titik pakai buat semua cek VPS remote (disk,
 *  backup, log Traefik) — lihat src/lib/crypto.ts. Fallback aman kalau data lama masih plaintext
 *  (sebelum enkripsi ini ada): decryptSecret balikin apa adanya. */
export function vpsSshCreds(vps: VpsSshLike): SshCreds {
  return {
    host: vps.host,
    port: vps.sshPort,
    username: vps.sshUser,
    password: vps.sshPassword ? decryptSecret(vps.sshPassword) : null,
    privateKey: vps.sshPrivateKey ? decryptSecret(vps.sshPrivateKey) : null,
  }
}

/** Escape aman buat dipakai di dalam single-quote shell — dipakai karena path (diskPath,
 *  backupCheckPath) disimpan sebagai teks bebas oleh owner, bukan sesuatu yang kita percaya
 *  100% bebas karakter spesial shell. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** User SSH biasa (non-root) umumnya TIDAK punya akses langsung ke docker.sock (perlu masuk grup
 *  `docker`) — daripada minta user ubah konfigurasi VPS-nya, pipe password SSH yang sama ke
 *  `sudo -S` (baca password dari stdin, `-p ''` supaya tidak nambah teks prompt di stdout/stderr).
 *  Cuma bisa dipakai kalau auth-nya pakai password (bukan private-key-only) — tanpa password,
 *  balikin command apa adanya (asumsi ada NOPASSWD sudoers, best-effort). */
export function sudoWrap(password: string | null | undefined, command: string): string {
  if (!password) return `sudo ${command}`
  return `echo ${shQuote(password)} | sudo -S -p '' ${command}`
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
      // Banyak VPS (mis. sshd default Ubuntu/Debian dengan PAM) minta metode auth
      // "keyboard-interactive", bukan "password" biasa — kalau cuma kirim `password` di
      // connect(), server bisa nolak semua metode ("All configured authentication methods
      // failed") walau passwordnya benar. `tryKeyboard: true` + handler ini jadi fallback:
      // jawab prompt keyboard-interactive pakai password yang sama.
      .on("keyboard-interactive", (_name, _instructions, _lang, prompts, finishAuth) => {
        finishAuth(creds.password ? prompts.map(() => creds.password as string) : [])
      })
      .on("error", (err) => finish(() => reject(err)))
      .connect({
        host: creds.host,
        port: creds.port,
        username: creds.username,
        password: creds.password || undefined,
        privateKey: creds.privateKey || undefined,
        tryKeyboard: true,
        readyTimeout: timeoutMs,
      })
  })
}

export type DockerDiskEntry = {
  type: string
  totalCount: number
  active: number
  size: string
  reclaimable: string
  reclaimablePct: number
}

export type AppContainerDisk = {
  coolifyUuid: string
  size: string
  virtualSize: string
}

export type VpsLiveCheck = {
  disk: DiskUsage | null
  diskError: string | null
  backupLatestFile: string | null
  backupLatestAt: string | null
  backupError: string | null
  dockerDisk: DockerDiskEntry[] | null
  dockerDiskError: string | null
  appDiskUsage: AppContainerDisk[] | null
}

const DELIM = "___SPLIT___"

function parseDockerDfLine(line: string): DockerDiskEntry | null {
  try {
    const obj = JSON.parse(line) as Record<string, string>
    if (!obj.Type) return null
    const pctMatch = obj.Reclaimable?.match(/\(([\d.]+)%\)/)
    return {
      type: obj.Type,
      totalCount: Number(obj.TotalCount) || 0,
      active: Number(obj.Active) || 0,
      size: obj.Size ?? "-",
      reclaimable: obj.Reclaimable ?? "-",
      reclaimablePct: pctMatch ? Number(pctMatch[1]) : 0,
    }
  } catch {
    return null
  }
}

/** Container Coolify ditandai label `coolify.name=<uuid aplikasi>` (cocok dengan
 *  Application.coolifyUuid kita) — cuma container APLIKASI yang punya label ini, container
 *  database Coolify pakai label lain (`coolify.databaseId` dst, tanpa `coolify.name`), jadi tidak
 *  ketimpa ketuker. `Size` dari `docker ps -s` formatnya "12.3kB (virtual 196MB)" — bagian
 *  pertama itu writable layer container itu sendiri (biasanya kecil buat app stateless), "virtual"
 *  itu total image+layer (termasuk layer dasar yang mungkin dipakai bareng container lain, jadi
 *  cuma perkiraan kasar "berapa berat image app ini", bukan porsi eksklusif dari total disk). */
function parseDockerPsLine(line: string): AppContainerDisk | null {
  try {
    const obj = JSON.parse(line) as Record<string, string>
    const nameMatch = obj.Labels?.match(/coolify\.name=([^,]+)/)
    if (!nameMatch) return null
    const sizeMatch = obj.Size?.match(/^([\d.]+\s*[A-Za-z]+)(?:\s*\(virtual\s+([\d.]+\s*[A-Za-z]+)\))?/)
    return {
      coolifyUuid: nameMatch[1],
      size: sizeMatch?.[1]?.trim() ?? obj.Size ?? "-",
      virtualSize: sizeMatch?.[2]?.trim() ?? "-",
    }
  } catch {
    return null
  }
}

export type VpsLiveCheckInput = VpsSshLike & { diskPath: string; backupCheckPath: string | null }

/** 1 koneksi SSH per VPS untuk disk usage + (kalau backupCheckPath diisi) file terbaru di folder
 *  backup itu + breakdown disk Docker (image/container/volume/build cache, lihat
 *  docs/monitoring-server.md § disk Docker) — digabung jadi 1 command supaya cuma 1 round-trip
 *  SSH, bukan 3. Diasumsikan VPS remote Linux (Coolify jalan di Linux) jadi aman pakai `stat -c`
 *  (GNU), beda dari cek disk lokal (src/app/api/monitoring/disk/route.ts) yang perlu portabel ke
 *  macOS untuk dev. */
export async function getVpsDiskAndBackup(vps: VpsLiveCheckInput): Promise<VpsLiveCheck> {
  const creds = vpsSshCreds(vps)
  const diskPathQ = shQuote(vps.diskPath || "/")
  const backupPathQ = vps.backupCheckPath ? shQuote(vps.backupCheckPath) : null
  const dockerDfCmd = sudoWrap(creds.password, `docker system df --format '{{json .}}' 2>/dev/null`)
  const dockerPsCmd = sudoWrap(creds.password, `docker ps -a -s --format '{{json .}}' 2>/dev/null`)

  const script = [
    `df -kP ${diskPathQ} | tail -1`,
    `echo "${DELIM}"`,
    backupPathQ
      ? `f=$(ls -t ${backupPathQ} 2>/dev/null | head -1); if [ -n "$f" ]; then echo "$f"; stat -c %Y ${backupPathQ}/"$f" 2>/dev/null; fi`
      : "",
    `echo "${DELIM}"`,
    dockerDfCmd,
    `echo "${DELIM}"`,
    dockerPsCmd,
  ].join("\n")

  let stdout: string
  try {
    // `docker system df` bisa lambat (belasan detik) kalau image/volume-nya banyak — dites di
    // VPS Dewari butuh ~18 detik sendiri, jadi timeout gabungan dilebihin cukup jauh.
    stdout = await sshExec(creds, script, 40000)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal SSH ke VPS"
    return {
      disk: null,
      diskError: message,
      backupLatestFile: null,
      backupLatestAt: null,
      backupError: vps.backupCheckPath ? message : null,
      dockerDisk: null,
      dockerDiskError: message,
      appDiskUsage: null,
    }
  }

  const [diskPart, backupPart = "", dockerPart = "", psPart = ""] = stdout.split(DELIM)

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

  const dockerEntries = dockerPart
    .trim()
    .split("\n")
    .map(parseDockerDfLine)
    .filter((e): e is DockerDiskEntry => e !== null)
  const dockerDisk = dockerEntries.length > 0 ? dockerEntries : null
  const dockerDiskError = dockerDisk ? null : "Gagal membaca disk usage Docker (perlu akses sudo/docker di VPS)"

  const appDiskEntries = psPart
    .trim()
    .split("\n")
    .map(parseDockerPsLine)
    .filter((e): e is AppContainerDisk => e !== null)
  const appDiskUsage = appDiskEntries.length > 0 ? appDiskEntries : null

  return { disk, diskError, backupLatestFile, backupLatestAt, backupError, dockerDisk, dockerDiskError, appDiskUsage }
}
