import type { ModuleKey } from "@/lib/current-user"

export type ApiUserLike = { role: string; modules: string[] }

/** Owner selalu bisa akses (bypass, sama pola dengan getCurrentUser), user lain harus punya
 *  modul "monitoring" di-assign — dipakai semua endpoint GET di bawah /api/monitoring. */
export function canViewMonitoring(user: ApiUserLike) {
  const module: ModuleKey = "monitoring"
  return user.role === "owner" || user.modules.includes(module)
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "-"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function formatDateTimeId(iso: string | Date | null) {
  if (!iso) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso))
}

export function formatDateOnlyId(iso: string | Date | null) {
  if (!iso) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(
    new Date(iso)
  )
}

export type DiskUsage = {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usedPct: number
  totalPretty: string
  usedPretty: string
  availablePretty: string
}

/** Parse baris kedua output `df -kP <path>` (POSIX, 1024-byte blocks — portabel Linux & macOS):
 *  "Filesystem 1024-blocks Used Available Capacity Mounted-on". Dipakai baik oleh cek disk lokal
 *  (src/app/api/monitoring/disk/route.ts) maupun cek disk VPS remote lewat SSH
 *  (src/lib/monitoring/ssh.ts) — satu tempat parsing supaya tidak dobel logic. */
export function parseDfLine(line: string): DiskUsage {
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

  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usedPct,
    totalPretty: formatBytes(totalBytes),
    usedPretty: formatBytes(usedBytes),
    availablePretty: formatBytes(availableBytes),
  }
}
