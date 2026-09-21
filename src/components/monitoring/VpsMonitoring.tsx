"use client"

import { useEffect, useState } from "react"
import {
  Server,
  HardDrive,
  Cpu,
  MemoryStick,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  GitBranch,
  ChevronDown,
  Globe,
  Sparkles,
  Search,
  DatabaseBackup,
  Box,
  Database,
  Clock,
  TrendingUp,
  Eye,
} from "lucide-react"

import { Button, Input, Textarea, Modal, Alert, Badge, Select } from "@/components/ui"
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table"
import { formatDateTimeId, formatDateOnlyId } from "@/lib/monitoring"

export type DiskInfo = {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usedPct: number
  totalPretty: string
  usedPretty: string
  availablePretty: string
}

export type AppRow = {
  id: string
  name: string
  domain: string | null
  gitRepository: string | null
  gitBranch: string | null
  databaseInfo: string | null
  activityQuery: string | null
  backupLocation: string | null
  lastBackupAt: string | null
  databaseUuid: string | null
  dbBackupAt: string | null
  dbBackupLink: string | null
  lastAccessedAt: string | null
  lastAccessedBy: string | null
  lastAccessedIp: string | null
  lastAccessedCity: string | null
  coolifyProjectName: string | null
  coolifyLink: string | null
  domainExpiresAt: string | null
  domainExpiryCheckedAt: string | null
  notes: string | null
  hasCoolifySync: boolean
  diskUsage: { size: string; virtualSize: string } | null
  databaseDiskUsage: { size: string; virtualSize: string } | null
  traffic: { bandwidthBytes7d: number; avgVisitorsPerDay: number; activeDays7d: number; label: "sering" | "normal" | "jarang" } | null
  bandwidthBytesThisMonth: number
  package: MonitoringPackageRow | null
  createdAt: string
}

export type MonitoringPackageRow = {
  id: string
  name: string
  /** BigInt dikirim API sebagai string (presisi) — parse ke Number pas dipakai (skala GB aman). */
  diskSpaceBytes: string
  bandwidthBytes: string
}

export type VpsRow = {
  id: string
  name: string
  host: string
  sshPort: number
  sshUser: string
  diskPath: string
  backupCheckPath: string | null
  proxyContainerName: string
  panelType: "none" | "coolify" | "enhance"
  hasCoolify: boolean
  coolifyApiUrl: string | null
  coolifyDatabaseCount: number | null
  coolifySyncError: string | null
  enhanceApiUrl: string | null
  enhanceOrgId: string | null
  createdAt: string
  disk: DiskInfo | null
  diskError: string | null
  backupLatestFile: string | null
  backupLatestAt: string | null
  backupError: string | null
  cpu: {
    loadPct1m: number
    loadPct5m: number
    loadPct15m: number
    cores: number
    processesRunning: number | null
    processesTotal: number | null
  } | null
  cpuError: string | null
  cpuCores: { core: string; usedPct: number }[] | null
  ram: { usedBytes: number; totalBytes: number; usedPct: number } | null
  ramError: string | null
  swap: { usedBytes: number; totalBytes: number; usedPct: number } | null
  uptimeSeconds: number | null
  dockerDisk: DockerDiskEntry[] | null
  dockerVolumes: { name: string; size: string }[] | null
  dockerDiskCheckedAt: string | null
  applications: AppRow[]
  registeredDomains: { name: string; tracked: boolean; active: boolean | null; expiryDate: string | null }[]
  activityToday: number
  databases: DatabaseRow[]
}

export type DatabaseRow = {
  uuid: string
  name: string
  databaseType: string
  diskUsage: { size: string; virtualSize: string } | null
  isActive: boolean
  lastOnlineAt: string | null
  dbBackupAt: string | null
  dbBackupLink: string | null
  projectName: string | null
  coolifyLink: string | null
}

export type DockerDiskEntry = {
  type: string
  totalCount: number
  active: number
  size: string
  reclaimable: string
  reclaimablePct: number
}

const DOCKER_TYPE_META: Record<string, { color: string; description: string }> = {
  Images: {
    color: "bg-amber-500",
    description: "Images — hasil build/deploy aplikasi (cetakan container). Paling sering numpuk jadi \"sampah\" kalau sering deploy ulang.",
  },
  Containers: {
    color: "bg-blue-500",
    description: "Containers — instance aplikasi yang sedang berjalan sekarang. Biasanya kecil, jarang jadi masalah.",
  },
  "Local Volumes": {
    color: "bg-emerald-500",
    description: "Local Volumes — data asli aplikasi (database, file upload, dll). BUKAN sampah, jangan pernah dihapus sembarangan.",
  },
  "Build Cache": {
    color: "bg-violet-500",
    description: "Build Cache — sisa proses build Docker (layer perantara). Bisa numpuk kalau sering build ulang dari awal.",
  },
}

const emptyAppForm = {
  vpsServerId: "",
  name: "",
  domain: "",
  gitRepository: "",
  gitBranch: "",
  backupLocation: "",
  activityQuery: "",
  lastBackupAt: "",
  domainExpiresAt: "",
  notes: "",
  packageId: "",
}

export function isBackupStale(iso: string | null) {
  if (!iso) return true
  return Date.now() - new Date(iso).getTime() > 30 * 60 * 60 * 1000
}

function timeAgoId(iso: string | null): string {
  if (!iso) return "belum pernah"
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "baru saja"
  if (min < 60) return `${min} menit lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} jam lalu`
  return `${Math.floor(hr / 24)} hari lalu`
}

/** Progress bar "palsu" (bukan progress asli — command SSH-nya cuma 1 blok, tidak ada laporan
 *  progress bertahap) buat cek disk Docker yang makan waktu ~20-25 detik, biar user tidak lihat
 *  layar diam tanpa feedback. Mendekati (bukan mencapai) 92% pakai kurva eksponensial mengikuti
 *  estimasi durasi, baru "loncat" ke 100% waktu request aslinya beneran selesai. */
function useFakeProgress(active: boolean, estimateMs: number) {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    if (!active) {
      setPct(0)
      return
    }
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      const target = 92
      setPct(Math.min(target * (1 - Math.exp(-elapsed / (estimateMs * 0.55))), target))
    }, 200)
    return () => clearInterval(id)
  }, [active, estimateMs])
  return pct
}

function dockerDiskProgressLabel(pct: number): string {
  if (pct < 12) return "Initializing…"
  if (pct < 45) return "Menghubungkan SSH & menghitung image…"
  if (pct < 75) return "Menghitung ukuran volume & container…"
  return "Hampir selesai…"
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function DomainExpiryBadge({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-slate-400 text-xs font-semibold">Belum diketahui</span>
  const days = daysUntil(iso)
  const label = `${formatDateOnlyId(iso)}${days >= 0 ? ` (${days} hari lagi)` : " (lewat)"}`
  const variant = days < 0 ? "danger" : days < 30 ? "danger" : days < 90 ? "warning" : "success"
  return <Badge variant={variant}>{label}</Badge>
}

/** KPI penggunaan aplikasi (bandwidth + kunjungan unik, window 7 hari) — datanya cuma keisi kalau
 *  VPS punya access log Traefik aktif (lihat panduan di form Tambah VPS) DAN sudah lewat minimal 1
 *  siklus cron harian (00:15 WIB). Sebelum itu, badge-nya "Belum ada data" — bukan otomatis
 *  dianggap "Jarang" (data kosong beda arti dari "diketahui sepi"). */
function UsageBadge({ traffic }: { traffic: AppRow["traffic"] }) {
  if (!traffic) return <span className="text-slate-400 text-xs font-semibold">Belum ada data</span>
  const variant = traffic.label === "sering" ? "success" : traffic.label === "normal" ? "info" : "warning"
  const text = traffic.label === "sering" ? "Sering digunakan" : traffic.label === "normal" ? "Normal" : "Jarang digunakan"
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={variant} size="sm">
        {text}
      </Badge>
      <span className="text-[11px] text-slate-500 font-medium">
        {formatBytes(traffic.bandwidthBytes7d)}/minggu · {traffic.avgVisitorsPerDay.toFixed(1)} kunjungan/hari · {traffic.activeDays7d}/7 hari aktif
      </span>
    </div>
  )
}

/** Kartu ringkasan kecil di atas daftar Aplikasi (gaya cardlist, lihat mockup/cardlist
 *  aplikasi.png) — angka SELALU dari data riil (dihitung dari appStats/vps.activityToday), TIDAK
 *  ada delta "naik/turun dari bulan lalu" seperti di mockup karena tidak ada baseline historis
 *  yang beneran disimpan (lihat percakapan monitoring 2026-09-21) — dipalsukan itu lebih menyesatkan
 *  daripada tidak ditampilkan sama sekali. */
function StatTile({ icon, iconClassName, label, value, hint }: { icon: React.ReactNode; iconClassName: string; label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3.5 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClassName}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-500 truncate">{label}</div>
        <div className="text-xl font-black text-slate-900 leading-tight">{value}</div>
        <div className="text-[11px] text-slate-400 font-medium truncate">{hint}</div>
      </div>
    </div>
  )
}

/** 1 baris label+value di modal "Lihat Detail" — baris disembunyikan total kalau value-nya
 *  kosong (null/undefined/string kosong), supaya modal tidak penuh baris "-" yang tidak berguna. */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-xs font-bold text-slate-500 col-span-1">{label}</span>
      <span className="text-xs text-slate-800 font-medium col-span-2 break-words">{value}</span>
    </div>
  )
}

/** Docker format size-nya kayak "23.86GB"/"28.91MB"/"0B" — asumsi 1024-based (sama kayak
 *  disk.totalBytes/usedBytes dari `df`, biar proporsinya konsisten dipetakan ke bar yang sama). */
function parseDockerSize(raw: string | undefined): number {
  if (!raw) return 0
  const m = raw.trim().match(/^([\d.]+)\s*([A-Za-z]+)/)
  if (!m) return 0
  const mult: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  return parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1)
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days} hari ${hours} jam`
  if (hours > 0) return `${hours} jam ${minutes} menit`
  return `${minutes} menit`
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = bytes
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(2)}${units[i]}`
}

/** Volume state builder BuildKit standalone (dipakai Coolify buat build image, prefix
 *  "buildx_buildkit_") — cache builder, BUKAN data aplikasi, aman dihapus via `docker buildx
 *  prune` (tombol "Bersihkan yang Tidak Terpakai"). `docker system df` TIDAK menghitung
 *  reclaimable buat kategori Volumes sama sekali, jadi tanpa deteksi manual ini volume gede kayak
 *  gini nyelip dianggap "tidak ada sampah" padahal nyatanya aman dihapus. */
const BUILDKIT_CACHE_VOLUME_RE = /^buildx_buildkit_/i

/** Volume Docker (mis. "postgres-data-dx6jpdbid0x8hieqtaef4tjp") namanya cuma UUID mentah, tidak
 *  kebaca ini database yang mana — UUID di ujung nama volume itu PERSIS UUID resource database
 *  Coolify (pola yang sama dipakai databaseVolumeUsage() di server, GET /api/monitoring/vps),
 *  jadi cocokkan ke daftar database yang sudah kita tau (vps.databases) buat kasih nama aslinya. */
function volumeDatabaseName(volumeName: string, databases: VpsRow["databases"]): string | null {
  return databases.find((db) => volumeName.includes(db.uuid))?.name ?? null
}

/** 1 baris volume di breakdown "Local Volumes" — dipakai di preview (8 teratas) DAN di modal
 *  "semua volume", supaya stylingnya selalu sama persis. */
function VolumeRow({ v, databases }: { v: { name: string; size: string }; databases: VpsRow["databases"] }) {
  const isCache = BUILDKIT_CACHE_VOLUME_RE.test(v.name)
  const dbName = volumeDatabaseName(v.name, databases)
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className={`font-medium truncate ${isCache ? "text-amber-700" : "text-slate-500"}`} title={v.name}>
        {v.name}
        {isCache ? (
          <span className="text-amber-600"> · cache builder, aman dihapus</span>
        ) : dbName ? (
          <span className="text-slate-700 font-semibold"> · {dbName}</span>
        ) : null}
      </span>
      <span className={`flex-shrink-0 font-semibold ${isCache ? "text-amber-700" : "text-slate-700"}`}>{v.size}</span>
    </div>
  )
}

/** Ambil nama repo yang gampang dibaca dari URL git (mis. "https://github.com/org/repo.git" →
 *  "org/repo") — fallback ke URL apa adanya kalau bukan URL valid (mis. format SSH
 *  "git@github.com:org/repo.git"). */
function repoDisplayName(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/^\//, "").replace(/\.git$/, "")
    return path || url
  } catch {
    return url.replace(/^git@[^:]+:/, "").replace(/\.git$/, "")
  }
}

/** Tampilkan data MILIK aplikasi ini sendiri (writable layer) sebagai angka utama, "total" (virtual
 *  size, termasuk base image Docker yang dipakai BERSAMA container lain) sebagai keterangan
 *  sekunder. Sebelumnya virtual size yang jadi angka utama — ternyata bikin bingung (pernah
 *  ditanya "kenapa app 100MB source code kepakai 2GB") karena base image yang sama kehitung
 *  penuh di SETIAP aplikasi yang pakainya, jadi kalau dijumlah antar-aplikasi hasilnya jauh
 *  melebihi disk fisik yang beneran terpakai (lihat percakapan monitoring 2026-09-21 — angka
 *  writable riil biasanya cuma puluhan KB, sementara virtual size bisa 200MB-1.6GB per aplikasi
 *  gara-gara base image bersama). */
function DiskContribution({ usage, totalBytes }: { usage: { size: string; virtualSize: string } | null; totalBytes: number | undefined }) {
  if (!usage) return <span className="text-slate-400">-</span>
  const virtualBytes = parseDockerSize(usage.virtualSize)
  const pct = totalBytes ? (virtualBytes / totalBytes) * 100 : null
  return (
    <span className="font-semibold text-slate-700">
      {usage.size} data aplikasi
      <span
        className="text-slate-400 font-normal"
        title="Termasuk base image Docker yang dipakai BERSAMA container lain — jangan dijumlah antar-aplikasi, base image yang sama cuma kehitung 1x di disk fisik VPS."
      >
        {" "}
        · ~{usage.virtualSize} total{pct !== null && ` (${pct < 0.1 ? "<0.1" : pct.toFixed(1)}% dari disk)`}
      </span>
    </span>
  )
}

/** Bar Disk Space bertingkat warna — biru = Local Volumes (data asli, database dll), oranye =
 *  bagian Images yang reclaimable ("sampah" hasil deploy berkali-kali), abu-abu = sisa terpakai
 *  yang tidak masuk 2 kategori itu (OS, image aktif, container, build cache). Fallback ke bar
 *  1 warna biasa kalau dockerDisk belum ada (mis. gagal sudo/docker). */
function DiskUsageBar({ disk, dockerDisk }: { disk: DiskInfo; dockerDisk: DockerDiskEntry[] | null }) {
  const volumes = dockerDisk?.find((d) => d.type === "Local Volumes")
  const images = dockerDisk?.find((d) => d.type === "Images")

  if (!dockerDisk || !disk.totalBytes) {
    return (
      <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${disk.usedPct >= 90 ? "bg-rose-500" : disk.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
          style={{ width: `${Math.min(disk.usedPct, 100)}%` }}
        />
      </div>
    )
  }

  const volumesBytes = parseDockerSize(volumes?.size)
  const reclaimableImageBytes = parseDockerSize(images?.reclaimable)
  const volumesPct = Math.min((volumesBytes / disk.totalBytes) * 100, disk.usedPct)
  const reclaimablePct = Math.min((reclaimableImageBytes / disk.totalBytes) * 100, Math.max(disk.usedPct - volumesPct, 0))
  const otherPct = Math.max(disk.usedPct - volumesPct - reclaimablePct, 0)

  return (
    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
      <div className="h-full bg-blue-600" style={{ width: `${volumesPct}%` }} title={`Local Volumes: ${volumes?.size ?? "-"}`} />
      <div className="h-full bg-amber-500" style={{ width: `${reclaimablePct}%` }} title={`Images reclaimable: ${images?.reclaimable ?? "-"}`} />
      <div className="h-full bg-slate-400" style={{ width: `${otherPct}%` }} title="Terpakai lainnya (OS, image aktif, container, dll)" />
    </div>
  )
}

export function DiskMiniBar({ disk, diskError }: { disk: DiskInfo | null; diskError: string | null }) {
  if (diskError) return <span className="text-[11px] font-semibold text-rose-600">Disk error</span>
  if (!disk) return null
  return (
    <div className="flex items-center gap-1.5" title={`Disk: ${disk.usedPct}%`}>
      <span className="text-[10px] font-bold text-slate-400 uppercase w-7 flex-shrink-0">Disk</span>
      <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${disk.usedPct >= 90 ? "bg-rose-500" : disk.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
          style={{ width: `${Math.min(disk.usedPct, 100)}%` }}
        />
      </div>
      <span className="text-[11px] font-bold text-slate-600 flex-shrink-0">{disk.usedPct}%</span>
    </div>
  )
}

/** Mini-bar generic buat CPU/RAM di header collapsed VPS card — sama gaya visual dengan
 *  DiskMiniBar (yang khusus disk karena bentuk datanya beda, punya usedPretty/totalPretty dst). */
function UsageMiniBar({ label, pct, error }: { label: string; pct: number | null; error: string | null }) {
  if (error) return <span className="text-[11px] font-semibold text-rose-600">{label} error</span>
  if (pct === null) return null
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${pct.toFixed(0)}%`}>
      <span className="text-[10px] font-bold text-slate-400 uppercase w-7 flex-shrink-0">{label}</span>
      <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-[11px] font-bold text-slate-600 flex-shrink-0">{pct.toFixed(0)}%</span>
    </div>
  )
}

/** Pagination client-side generic (dipakai tabel Aplikasi & Database) — lihat catatan kenapa
 *  bukan server-side di dekat pemanggilnya (VpsServerCard). */
function TablePagination({ page, pageCount, total, onChange }: { page: number; pageCount: number; total: number; onChange: (p: number) => void }) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="text-[11px] text-slate-400 font-medium">
        {total} baris — halaman {page} dari {pageCount}
      </span>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
          Sebelumnya
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onChange(page + 1)} disabled={page >= pageCount}>
          Berikutnya
        </Button>
      </div>
    </div>
  )
}

type VpsHealthLevel = "sehat" | "perhatian" | "kritis"
type HealthCheckStatus = "ok" | "warning" | "critical" | "unknown"

export interface HealthCheckItem {
  key: string
  label: string
  status: HealthCheckStatus
  detail: string
  /** true = ditampilkan di dialog rincian tapi TIDAK ikut menentukan badge Sehat/Perhatian/Kritis
   *  (dipakai buat CPU — load rata-rata wajar naik-turun cepat, beda dari disk/RAM yang begitu
   *  tinggi biasanya masalah menetap). */
  informational?: boolean
}

const HEALTH_STATUS_META: Record<HealthCheckStatus, { label: string; badge: "success" | "warning" | "danger" | "secondary" }> = {
  ok: { label: "Sehat", badge: "success" },
  warning: { label: "Perhatian", badge: "warning" },
  critical: { label: "Kritis", badge: "danger" },
  unknown: { label: "Tidak Diketahui", badge: "secondary" },
}

/** Kesimpulan 1 badge dari semua sinyal yang ada per VPS — supaya kelihatan langsung tanpa expand
 *  card. "Kritis" kalau ada yang beneran rusak/mati (disk/RAM nyaris penuh, LEBIH DARI 5 database
 *  mati sekaligus, domain sudah expired); "Perhatian" kalau masih jalan tapi mulai mencurigakan
 *  (disk/RAM tinggi, swap kepake, backup lewat 1 hari, 1-5 database mati, domain mau expired).
 *  Ambang disk/RAM sama persis dengan warna tiap mini-bar individual (≥90 rose, ≥75 amber) supaya
 *  konsisten. Database mati SENGAJA dihitung per JUMLAH (bukan langsung Kritis begitu 1 mati) —
 *  VPS dengan banyak database (mis. 7smarts, 17 database) wajar ada beberapa yang sengaja
 *  di-stop (dev/staging/tidak dipakai lagi), jadi 1-2 mati itu normal, bukan insiden.
 *
 *  `checks` berisi SEMUA parameter yang dicek (bukan cuma yang bermasalah) — dipakai dialog
 *  rincian yang muncul saat badge di-klik (permintaan Owner 2026-09-20: "parameternya kenapa
 *  kamu tampilkan saat di klik badge... semua parameter apa, yang sehat, yang kritis mana"). */
function computeVpsHealth(vps: VpsRow): { level: VpsHealthLevel; reasons: string[]; checks: HealthCheckItem[] } {
  const checks: HealthCheckItem[] = []

  // Token API Coolify rusak (dicabut/expired/direinstall di sisi Coolify) bikin SEMUA data
  // aplikasi/database di VPS ini diam-diam jadi cache basi — critical, bukan sekadar warning,
  // karena user tidak bisa lagi percaya data yang ditampilkan sampai token-nya dibetulkan (lihat
  // kejadian nyata 2026-09-21, ketahuan baru pas coba "Backup Sekarang").
  if (vps.hasCoolify && vps.coolifySyncError) {
    checks.push({ key: "coolify-sync", label: "Sinkronisasi Coolify", status: "critical", detail: vps.coolifySyncError })
  }

  if (vps.diskError) {
    checks.push({ key: "disk", label: "Disk", status: "unknown", detail: vps.diskError })
  } else if (vps.disk) {
    const pct = vps.disk.usedPct
    checks.push({
      key: "disk",
      label: "Disk",
      status: pct >= 90 ? "critical" : pct >= 75 ? "warning" : "ok",
      detail: `${pct}% terpakai (${vps.disk.usedPretty} / ${vps.disk.totalPretty})`,
    })
  } else {
    checks.push({ key: "disk", label: "Disk", status: "unknown", detail: "Tidak ada data" })
  }

  if (vps.ramError) {
    checks.push({ key: "ram", label: "RAM", status: "unknown", detail: vps.ramError })
  } else if (vps.ram) {
    const pct = vps.ram.usedPct
    checks.push({
      key: "ram",
      label: "RAM",
      status: pct >= 90 ? "critical" : pct >= 75 ? "warning" : "ok",
      detail: `${pct.toFixed(0)}% terpakai (${formatBytes(vps.ram.usedBytes)} / ${formatBytes(vps.ram.totalBytes)})`,
    })
  } else {
    checks.push({ key: "ram", label: "RAM", status: "unknown", detail: "Tidak ada data" })
  }

  if (vps.swap) {
    const pct = vps.swap.usedPct
    checks.push({
      key: "swap",
      label: "Swap",
      status: pct > 50 ? "warning" : "ok",
      detail: pct > 0 ? `${pct.toFixed(0)}% terpakai (${formatBytes(vps.swap.usedBytes)} / ${formatBytes(vps.swap.totalBytes)})` : "Tidak terpakai",
    })
  } else {
    checks.push({ key: "swap", label: "Swap", status: "ok", detail: "Tidak ada swap" })
  }

  if (vps.cpuError) {
    checks.push({ key: "cpu", label: "CPU", status: "unknown", detail: vps.cpuError, informational: true })
  } else if (vps.cpu) {
    const pct = vps.cpu.loadPct1m
    checks.push({
      key: "cpu",
      label: "CPU",
      status: pct >= 90 ? "critical" : pct >= 75 ? "warning" : "ok",
      detail: `Load ${pct.toFixed(0)}% dari ${vps.cpu.cores} core`,
      informational: true,
    })
  }

  const inactiveDatabases = vps.databases.filter((db) => !db.isActive)
  const inactiveTier: HealthCheckStatus = inactiveDatabases.length > 5 ? "critical" : "warning"
  for (const db of vps.databases) {
    if (!db.isActive) {
      checks.push({ key: `db-${db.uuid}`, label: `Database "${db.name}"`, status: inactiveTier, detail: "Mati/nonaktif" })
    } else if (isBackupStale(db.dbBackupAt)) {
      checks.push({ key: `db-${db.uuid}`, label: `Database "${db.name}"`, status: "warning", detail: "Backup lebih dari 1 hari" })
    } else {
      checks.push({ key: `db-${db.uuid}`, label: `Database "${db.name}"`, status: "ok", detail: "Aktif, backup terbaru" })
    }
  }

  for (const d of vps.registeredDomains) {
    if (!d.expiryDate) {
      checks.push({ key: `domain-${d.name}`, label: `Domain ${d.name}`, status: "unknown", detail: "Tanggal berakhir tidak diketahui" })
      continue
    }
    const days = Math.floor((new Date(d.expiryDate).getTime() - Date.now()) / 86_400_000)
    checks.push({
      key: `domain-${d.name}`,
      label: `Domain ${d.name}`,
      status: days < 0 ? "critical" : days < 30 ? "warning" : "ok",
      detail: days < 0 ? `Sudah expired ${Math.abs(days)} hari lalu` : `Habis ${days} hari lagi`,
    })
  }

  // Paket kuota Disk Space + Bandwidth per aplikasi (opsional, lihat MonitoringPackage) — cuma
  // dicek buat aplikasi yang memang di-assign paket. Disk dibandingkan ke pemakaian LIVE
  // (diskUsage app + databaseDiskUsage, format Docker "23.86GB" — dipakai parseDockerSize yang
  // sama dengan breakdown disk lainnya), Bandwidth ke kumulatif bulan berjalan.
  for (const app of vps.applications) {
    if (!app.package) continue
    const diskUsedBytes = parseDockerSize(app.diskUsage?.size) + parseDockerSize(app.databaseDiskUsage?.size)
    const diskQuotaBytes = Number(app.package.diskSpaceBytes)
    checks.push({
      key: `pkg-disk-${app.id}`,
      label: `Disk "${app.name}" (${app.package.name})`,
      status: diskUsedBytes > diskQuotaBytes ? "warning" : "ok",
      detail: `${formatBytes(diskUsedBytes)} dari kuota ${formatBytes(diskQuotaBytes)}`,
    })

    const bandwidthQuotaBytes = Number(app.package.bandwidthBytes)
    checks.push({
      key: `pkg-bandwidth-${app.id}`,
      label: `Bandwidth "${app.name}" (${app.package.name})`,
      status: app.bandwidthBytesThisMonth > bandwidthQuotaBytes ? "warning" : "ok",
      detail: `${formatBytes(app.bandwidthBytesThisMonth)} dari kuota ${formatBytes(bandwidthQuotaBytes)}/bulan (bulan berjalan)`,
    })
  }

  const levelChecks = checks.filter((c) => !c.informational)
  const criticalChecks = levelChecks.filter((c) => c.status === "critical")
  const warningChecks = levelChecks.filter((c) => c.status === "warning")
  const level: VpsHealthLevel = criticalChecks.length > 0 ? "kritis" : warningChecks.length > 0 ? "perhatian" : "sehat"
  const reasons = (level === "kritis" ? criticalChecks : level === "perhatian" ? warningChecks : []).map((c) => `${c.label}: ${c.detail}`)

  return { level, reasons, checks }
}

/** Dipakai buat urutkan tabel Aplikasi/Database — baris yang bermasalah ditaruh paling atas
 *  (bukan sekadar disortir alfabetis) supaya kelihatan langsung di halaman pertama tanpa perlu
 *  paging jauh-jauh. Ambang sama dengan computeVpsHealth (domain <30 hari, backup lewat 1 hari). */
function isAppUnhealthy(app: AppRow): boolean {
  if (app.domainExpiresAt) {
    const days = Math.floor((new Date(app.domainExpiresAt).getTime() - Date.now()) / 86_400_000)
    if (days < 30) return true
  }
  if (app.databaseUuid && isBackupStale(app.dbBackupAt)) return true
  return false
}

function isDbUnhealthy(db: VpsRow["databases"][number]): boolean {
  return !db.isActive || isBackupStale(db.dbBackupAt)
}

/** Satu kartu VPS yang bisa di-expand/collapse — dipakai di dalam list "VPS Lain" pada
 *  MonitoringDashboard.tsx. Ngurus sendiri modal Edit VPS & Tambah/Edit Aplikasi (spesifik ke
 *  VPS ini); modal "Tambah VPS" (VPS baru) ada di parent karena tidak terikat ke satu VPS. */
export const VpsServerCard: React.FC<{
  vps: VpsRow
  isOwner: boolean
  expanded: boolean
  onToggleExpand: () => void
  onChanged: () => void
  packages: MonitoringPackageRow[]
}> = ({ vps, isOwner, expanded, onToggleExpand, onChanged, packages }) => {
  const [syncing, setSyncing] = useState(false)
  const [checkingDockerDisk, setCheckingDockerDisk] = useState(false)
  const [pruning, setPruning] = useState(false)
  const [search, setSearch] = useState("")
  const [appPage, setAppPage] = useState(1)
  const [dbPage, setDbPage] = useState(1)
  const [appFilterMode, setAppFilterMode] = useState<"all" | "needsBackup" | "expiringSoon">("all")
  const [appSortMode, setAppSortMode] = useState<"terbaru" | "nama">("terbaru")
  const [viewingApp, setViewingApp] = useState<AppRow | null>(null)
  const [dbFilterMode, setDbFilterMode] = useState<"all" | "active" | "needsBackup">("all")
  const [dbSortMode, setDbSortMode] = useState<"terbaru" | "nama">("terbaru")
  const [viewingDb, setViewingDb] = useState<DatabaseRow | null>(null)
  useEffect(() => {
    setAppPage(1)
    setDbPage(1)
  }, [search, appFilterMode, dbFilterMode])
  const [backingUpDbUuid, setBackingUpDbUuid] = useState<string | null>(null)
  const [healthDetailOpen, setHealthDetailOpen] = useState(false)
  const [volumesModalOpen, setVolumesModalOpen] = useState(false)
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false)
  const [pruneResult, setPruneResult] = useState<{
    ok: boolean
    systemReclaimed: string | null
    buildxOk: boolean
    buildxOutput: string
    error?: string
  } | null>(null)
  const [resettingBuilder, setResettingBuilder] = useState(false)
  const [resetBuilderConfirmOpen, setResetBuilderConfirmOpen] = useState(false)
  const [resetBuilderResult, setResetBuilderResult] = useState<{ ok: boolean; output: string; error?: string } | null>(null)
  const dockerDiskProgress = useFakeProgress(checkingDockerDisk, 70000)

  const [isVpsModalOpen, setIsVpsModalOpen] = useState(false)
  const [vpsForm, setVpsForm] = useState({
    name: vps.name,
    host: vps.host,
    sshPort: String(vps.sshPort),
    sshUser: vps.sshUser,
    sshPassword: "",
    sshPrivateKey: "",
    diskPath: vps.diskPath,
    backupCheckPath: vps.backupCheckPath ?? "",
    proxyContainerName: vps.proxyContainerName,
    panelType: vps.panelType,
    coolifyApiUrl: vps.coolifyApiUrl ?? "",
    coolifyApiToken: "",
    enhanceApiUrl: vps.enhanceApiUrl ?? "",
    enhanceApiToken: "",
    enhanceOrgId: vps.enhanceOrgId ?? "",
  })
  const [vpsFormError, setVpsFormError] = useState("")
  const [savingVps, setSavingVps] = useState(false)

  const [isAppModalOpen, setIsAppModalOpen] = useState(false)
  const [editingAppId, setEditingAppId] = useState<string | null>(null)
  const [appForm, setAppForm] = useState(emptyAppForm)
  const [appFormError, setAppFormError] = useState("")
  const [savingApp, setSavingApp] = useState(false)

  const openEditVps = () => {
    setVpsForm({
      name: vps.name,
      host: vps.host,
      sshPort: String(vps.sshPort),
      sshUser: vps.sshUser,
      sshPassword: "",
      sshPrivateKey: "",
      diskPath: vps.diskPath,
      backupCheckPath: vps.backupCheckPath ?? "",
      proxyContainerName: vps.proxyContainerName,
      panelType: vps.panelType,
      coolifyApiUrl: vps.coolifyApiUrl ?? "",
      coolifyApiToken: "",
      enhanceApiUrl: vps.enhanceApiUrl ?? "",
      enhanceApiToken: "",
      enhanceOrgId: vps.enhanceOrgId ?? "",
    })
    setVpsFormError("")
    setIsVpsModalOpen(true)
  }

  const handleSaveVps = async () => {
    setVpsFormError("")
    if (!vpsForm.name.trim() || !vpsForm.host.trim() || !vpsForm.sshUser.trim()) {
      setVpsFormError("Nama, host, dan SSH user wajib diisi")
      return
    }
    setSavingVps(true)
    try {
      const body = {
        name: vpsForm.name.trim(),
        host: vpsForm.host.trim(),
        sshPort: Number(vpsForm.sshPort) || 22,
        sshUser: vpsForm.sshUser.trim(),
        ...(vpsForm.sshPassword.trim() ? { sshPassword: vpsForm.sshPassword.trim() } : {}),
        ...(vpsForm.sshPrivateKey.trim() ? { sshPrivateKey: vpsForm.sshPrivateKey.trim() } : {}),
        diskPath: vpsForm.diskPath.trim() || "/",
        backupCheckPath: vpsForm.backupCheckPath.trim(),
        proxyContainerName: vpsForm.proxyContainerName.trim() || "coolify-proxy",
        panelType: vpsForm.panelType,
        coolifyApiUrl: vpsForm.coolifyApiUrl.trim(),
        ...(vpsForm.coolifyApiToken.trim() ? { coolifyApiToken: vpsForm.coolifyApiToken.trim() } : {}),
        enhanceApiUrl: vpsForm.enhanceApiUrl.trim(),
        ...(vpsForm.enhanceApiToken.trim() ? { enhanceApiToken: vpsForm.enhanceApiToken.trim() } : {}),
        enhanceOrgId: vpsForm.enhanceOrgId.trim(),
      }
      const res = await fetch(`/api/monitoring/vps/${vps.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setVpsFormError(data?.error || "Gagal menyimpan VPS")
        return
      }
      setIsVpsModalOpen(false)
      onChanged()
    } finally {
      setSavingVps(false)
    }
  }

  const handleDeleteVps = async () => {
    if (!confirm(`Hapus VPS "${vps.name}" beserta semua aplikasi di bawahnya dari daftar pantauan?`)) return
    await fetch(`/api/monitoring/vps/${vps.id}`, { method: "DELETE" })
    onChanged()
  }

  const handleRefreshChecks = async () => {
    setSyncing(true)
    setCheckingDockerDisk(true)
    try {
      const res = await fetch(`/api/monitoring/vps/${vps.id}/refresh-checks`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error || "Gagal sync & cek")
        return
      }
      onChanged()
    } finally {
      setSyncing(false)
      setCheckingDockerDisk(false)
    }
  }

  const handleBackupNow = async (databaseUuid: string) => {
    if (!confirm("Trigger backup sekarang buat database ini? File hasil backup butuh beberapa saat sebelum kelihatan di kolom DB Backup.")) return
    setBackingUpDbUuid(databaseUuid)
    try {
      const res = await fetch(`/api/monitoring/vps/${vps.id}/databases/${databaseUuid}/backup-now`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error || "Gagal trigger backup")
        return
      }
      alert("Backup sudah di-trigger, jalan di background di Coolify. Cek lagi beberapa menit lagi.")
    } finally {
      setBackingUpDbUuid(null)
    }
  }

  const handleCheckDockerDisk = async () => {
    setCheckingDockerDisk(true)
    try {
      const res = await fetch(`/api/monitoring/vps/${vps.id}/docker-disk`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error || "Gagal cek disk Docker")
        return
      }
      onChanged()
    } finally {
      setCheckingDockerDisk(false)
    }
  }

  const runPruneUnused = async () => {
    setPruneConfirmOpen(false)
    setPruning(true)
    try {
      const res = await fetch(`/api/monitoring/vps/${vps.id}/prune-unused`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPruneResult({ ok: false, systemReclaimed: null, buildxOk: false, buildxOutput: "", error: data?.error || "Gagal jalankan cleanup" })
        return
      }
      setPruneResult({ ok: true, systemReclaimed: data.systemReclaimed ?? null, buildxOk: !!data.buildxOk, buildxOutput: data.buildxOutput ?? "" })
      await handleCheckDockerDisk()
    } finally {
      setPruning(false)
    }
  }

  const runResetBuilderCache = async () => {
    setResetBuilderConfirmOpen(false)
    setResettingBuilder(true)
    try {
      const res = await fetch(`/api/monitoring/vps/${vps.id}/reset-builder-cache`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResetBuilderResult({ ok: false, output: "", error: data?.error || "Gagal reset builder cache" })
        return
      }
      setResetBuilderResult({ ok: !!data.ok, output: data.output ?? "" })
      await handleCheckDockerDisk()
    } finally {
      setResettingBuilder(false)
    }
  }

  const openAddApp = () => {
    setEditingAppId(null)
    setAppForm({ ...emptyAppForm, vpsServerId: vps.id })
    setAppFormError("")
    setIsAppModalOpen(true)
  }

  const openEditApp = (app: AppRow) => {
    setEditingAppId(app.id)
    setAppForm({
      vpsServerId: vps.id,
      name: app.name,
      domain: app.domain ?? "",
      gitRepository: app.gitRepository ?? "",
      gitBranch: app.gitBranch ?? "",
      backupLocation: app.backupLocation ?? "",
      activityQuery: app.activityQuery ?? "",
      lastBackupAt: app.lastBackupAt ? app.lastBackupAt.slice(0, 10) : "",
      domainExpiresAt: app.domainExpiresAt ? app.domainExpiresAt.slice(0, 10) : "",
      notes: app.notes ?? "",
      packageId: app.package?.id ?? "",
    })
    setAppFormError("")
    setIsAppModalOpen(true)
  }

  const handleSaveApp = async () => {
    setAppFormError("")
    if (!appForm.name.trim()) {
      setAppFormError("Nama aplikasi wajib diisi")
      return
    }
    setSavingApp(true)
    try {
      const body = {
        vpsServerId: appForm.vpsServerId,
        name: appForm.name.trim(),
        domain: appForm.domain.trim(),
        gitRepository: appForm.gitRepository.trim(),
        gitBranch: appForm.gitBranch.trim(),
        backupLocation: appForm.backupLocation.trim(),
        activityQuery: appForm.activityQuery.trim(),
        lastBackupAt: appForm.lastBackupAt,
        domainExpiresAt: appForm.domainExpiresAt,
        notes: appForm.notes.trim(),
        packageId: appForm.packageId,
      }
      const res = await fetch(editingAppId ? `/api/monitoring/applications/${editingAppId}` : "/api/monitoring/applications", {
        method: editingAppId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setAppFormError(data?.error || "Gagal menyimpan aplikasi")
        return
      }
      setIsAppModalOpen(false)
      onChanged()
    } finally {
      setSavingApp(false)
    }
  }

  const health = computeVpsHealth(vps)
  const healthBadgeVariant = health.level === "kritis" ? "danger" : health.level === "perhatian" ? "warning" : "success"
  const healthLabel = health.level === "kritis" ? "Kritis" : health.level === "perhatian" ? "Perhatian" : "Sehat"

  // Filter + pagination client-side (data per VPS sudah kebawa semua di 1 request, lihat GET
  // /api/monitoring/vps) — SENGAJA bukan server-side: badge kesimpulan Sehat/Perhatian/Kritis di
  // atas butuh data LENGKAP semua baris (buat deteksi database mati/backup basi), jadi datanya
  // sudah pasti kebawa semua ke client sekali jalan — server-side pagination di tabel ini cuma
  // nambah kompleksitas (endpoint terpisah) tanpa benar² ngurangin payload (lihat percakapan
  // monitoring). Yang bermasalah (isAppUnhealthy/isDbUnhealthy) ditaruh paling atas biar kelihatan
  // tanpa perlu buka halaman jauh-jauh.
  const appNeedsBackup = (app: AppRow) => Boolean(app.databaseUuid && isBackupStale(app.dbBackupAt))
  const appExpiringSoon = (app: AppRow) => Boolean(app.domainExpiresAt && daysUntil(app.domainExpiresAt) < 30)
  // StatTile dihitung dari SEMUA aplikasi (bukan yang lolos search/filter) — supaya angkanya tetap
  // jadi acuan total yang stabil walau user lagi nyari/nyaring sesuatu yang lain.
  const appStats = {
    total: vps.applications.length,
    needsBackup: vps.applications.filter(appNeedsBackup).length,
    expiringSoon: vps.applications.filter(appExpiringSoon).length,
  }

  const PAGE_SIZE = 10
  const searchTerm = search.trim().toLowerCase()
  const sortedApplications = [...vps.applications]
    .filter((app) => !searchTerm || [app.name, app.domain, app.coolifyProjectName].some((v) => v?.toLowerCase().includes(searchTerm)))
    .filter((app) => {
      if (appFilterMode === "needsBackup") return appNeedsBackup(app)
      if (appFilterMode === "expiringSoon") return appExpiringSoon(app)
      return true
    })
    .sort((a, b) => {
      if (appSortMode === "nama") return a.name.localeCompare(b.name)
      if (isAppUnhealthy(a) !== isAppUnhealthy(b)) return Number(isAppUnhealthy(b)) - Number(isAppUnhealthy(a))
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  const appPageCount = Math.max(Math.ceil(sortedApplications.length / PAGE_SIZE), 1)
  // Clamp (bukan cuma pakai appPage mentah) — data bisa berubah (delete/refresh) sampai page
  // lama jadi out-of-range, tanpa ini malah kelihatan "tidak ada hasil" yang menyesatkan.
  const currentAppPage = Math.min(appPage, appPageCount)
  const filteredApplications = sortedApplications.slice((currentAppPage - 1) * PAGE_SIZE, currentAppPage * PAGE_SIZE)

  const dbNeedsBackup = (db: DatabaseRow) => isBackupStale(db.dbBackupAt)
  const dbStats = {
    total: vps.databases.length,
    active: vps.databases.filter((d) => d.isActive).length,
    postgresql: vps.databases.filter((d) => d.databaseType === "PostgreSQL").length,
    mariadb: vps.databases.filter((d) => d.databaseType === "MariaDB").length,
    needsBackup: vps.databases.filter(dbNeedsBackup).length,
  }

  const sortedDatabases = [...vps.databases]
    .filter((db) => !searchTerm || [db.name, db.projectName].some((v) => v?.toLowerCase().includes(searchTerm)))
    .filter((db) => {
      if (dbFilterMode === "active") return db.isActive
      if (dbFilterMode === "needsBackup") return dbNeedsBackup(db)
      return true
    })
    .sort((a, b) => {
      if (dbSortMode === "nama") return a.name.localeCompare(b.name)
      if (isDbUnhealthy(a) !== isDbUnhealthy(b)) return Number(isDbUnhealthy(b)) - Number(isDbUnhealthy(a))
      return new Date(b.lastOnlineAt ?? 0).getTime() - new Date(a.lastOnlineAt ?? 0).getTime()
    })
  const dbPageCount = Math.max(Math.ceil(sortedDatabases.length / PAGE_SIZE), 1)
  const currentDbPage = Math.min(dbPage, dbPageCount)
  const filteredDatabases = sortedDatabases.slice((currentDbPage - 1) * PAGE_SIZE, currentDbPage * PAGE_SIZE)

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-md overflow-hidden">
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-3 text-left px-4 sm:px-5 py-4 cursor-pointer hover:bg-white/60 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <Server className="w-4.5 h-4.5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <div className="font-black text-slate-900 truncate">{vps.name}</div>
            <div className="text-xs font-semibold text-slate-500 truncate">
              {vps.panelType !== "none" && `${vps.panelType === "coolify" ? "Coolify" : "Enhance"} · `}
              {vps.applications.length} aplikasi · {vps.databases.length} database
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2.5">
            <DiskMiniBar disk={vps.disk} diskError={vps.diskError} />
            <UsageMiniBar label="CPU" pct={vps.cpu?.loadPct1m ?? null} error={vps.cpuError} />
            <UsageMiniBar label="RAM" pct={vps.ram?.usedPct ?? null} error={vps.ramError} />
          </div>
          <Badge
            variant={healthBadgeVariant}
            size="sm"
            className="cursor-pointer hover:brightness-95 transition-[filter]"
            role="button"
            tabIndex={0}
            title="Klik untuk lihat rincian semua parameter"
            onClick={(e) => {
              e.stopPropagation()
              setHealthDetailOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                e.stopPropagation()
                setHealthDetailOpen(true)
              }
            }}
          >
            {healthLabel}
          </Badge>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 flex flex-col gap-4 border-t border-slate-200/80 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Aplikasi</div>
              <div className="text-xl font-black text-slate-800">{vps.applications.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Database (Coolify)</div>
              <div className="text-xl font-black text-slate-800">{vps.coolifyDatabaseCount ?? "-"}</div>
            </div>
          </div>

          {isOwner && (
            <div className="flex items-center gap-1.5 justify-end flex-wrap">
              <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddApp}>
                Aplikasi
              </Button>
              <Button variant="primary" size="sm" leftIcon={<Pencil className="w-4 h-4" />} onClick={openEditVps}>
                Edit VPS
              </Button>
              <button
                onClick={handleDeleteVps}
                className="text-rose-500 hover:text-rose-700 p-2 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                aria-label="Hapus VPS"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {vps.uptimeSeconds !== null && (
            <span
              className="text-[11px] text-slate-400 font-medium -mb-1"
              title="Lama VPS menyala tanpa reboot sejak boot/restart terakhir."
            >
              Uptime: {formatUptime(vps.uptimeSeconds)}
            </span>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <span
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide"
                title="Rata-rata beban CPU 1 menit terakhir dibagi jumlah core, dalam persen. Lebih dari 100% berarti ada proses yang antre nunggu giliran CPU (VPS mulai keteteran)."
              >
                <Cpu className="w-3.5 h-3.5" /> CPU
              </span>
              {vps.cpuError ? (
                <span className="text-xs font-semibold text-rose-600">{vps.cpuError}</span>
              ) : vps.cpu ? (
                <>
                  <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${vps.cpu.loadPct1m >= 90 ? "bg-rose-500" : vps.cpu.loadPct1m >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
                      style={{ width: `${Math.min(vps.cpu.loadPct1m, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {vps.cpu.loadPct1m.toFixed(0)}% <span className="text-slate-400 font-medium">({vps.cpu.cores} core)</span>
                  </span>
                  <span
                    className="text-[11px] text-slate-400 font-medium"
                    title="Rata-rata beban CPU yang sama, tapi dihitung dari jendela waktu 5 menit dan 15 menit terakhir — buat lihat tren (naik/turun/stabil), bukan cuma sesaat."
                  >
                    5m: {vps.cpu.loadPct5m.toFixed(0)}% · 15m: {vps.cpu.loadPct15m.toFixed(0)}%
                  </span>
                  {vps.cpu.processesRunning !== null && vps.cpu.processesTotal !== null && (
                    <span
                      className="text-[11px] text-slate-400 font-medium"
                      title="'Jalan' = proses yang benar-benar sedang dieksekusi CPU detik ini. 'Total' = semua proses + thread yang ada di sistem (termasuk yang lagi idle/nunggu)."
                    >
                      Proses: {vps.cpu.processesRunning} jalan / {vps.cpu.processesTotal} total
                    </span>
                  )}
                  {vps.cpuCores && (
                    <div
                      className="flex flex-wrap gap-1 mt-0.5"
                      title="Pemakaian tiap core CPU secara terpisah (bukan rata-rata gabungan di atas) — kalau 1 core jauh lebih tinggi dari yang lain, biasanya ada 1 proses yang tidak bisa multi-thread lagi ngebut sendirian."
                    >
                      {vps.cpuCores.map((c) => (
                        <span
                          key={c.core}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            c.usedPct >= 90
                              ? "bg-rose-100 text-rose-700"
                              : c.usedPct >= 75
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {c.core.replace("cpu", "C")}: {c.usedPct.toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-xs font-medium text-slate-400">-</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <span
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide"
                title="Memori yang beneran terpakai (Total dikurangi MemAvailable) — cache/buffer OS yang masih bisa dilepas kapan saja TIDAK dihitung 'terpakai', beda dari sekadar MemFree yang sering kelihatan rendah padahal sebagian besar cuma cache."
              >
                <MemoryStick className="w-3.5 h-3.5" /> RAM
              </span>
              {vps.ramError ? (
                <span className="text-xs font-semibold text-rose-600">{vps.ramError}</span>
              ) : vps.ram ? (
                <>
                  <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${vps.ram.usedPct >= 90 ? "bg-rose-500" : vps.ram.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
                      style={{ width: `${Math.min(vps.ram.usedPct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {formatBytes(vps.ram.usedBytes)} / {formatBytes(vps.ram.totalBytes)} ({vps.ram.usedPct.toFixed(0)}%)
                  </span>
                </>
              ) : (
                <span className="text-xs font-medium text-slate-400">-</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <span
                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide"
                title="Ruang disk yang dipakai sebagai 'RAM cadangan' saat RAM fisik penuh. Baca/tulis disk jauh lebih lambat dari RAM, jadi swap terpakai tinggi = performa VPS ikut melambat drastis, bukan sekadar indikator ruang kosong."
              >
                <MemoryStick className="w-3.5 h-3.5" /> Swap
              </span>
              {vps.swap ? (
                <>
                  <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${vps.swap.usedPct >= 90 ? "bg-rose-500" : vps.swap.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
                      style={{ width: `${Math.min(vps.swap.usedPct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {formatBytes(vps.swap.usedBytes)} / {formatBytes(vps.swap.totalBytes)} ({vps.swap.usedPct.toFixed(0)}%)
                  </span>
                </>
              ) : (
                <span className="text-xs font-medium text-slate-400">Tidak ada swap</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
              <HardDrive className="w-3.5 h-3.5" /> Disk Space ({vps.diskPath})
            </span>
            {vps.diskError ? (
              <span className="text-xs font-semibold text-rose-600">{vps.diskError}</span>
            ) : vps.disk ? (
              <div className="flex flex-col gap-1.5">
                <DiskUsageBar disk={vps.disk} dockerDisk={vps.dockerDisk} />
                <span className="text-xs font-semibold text-slate-700">
                  {vps.disk.usedPretty} / {vps.disk.totalPretty} ({vps.disk.usedPct}%)
                  {vps.dockerDisk && (
                    <span className="ml-2 font-medium text-slate-500">
                      <span className="text-blue-600 font-bold">■</span> Volumes ·{" "}
                      <span className="text-amber-600 font-bold">■</span> Sampah image ·{" "}
                      <span className="text-slate-400 font-bold">■</span> Lainnya
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  Data aplikasi/domain/database disync {timeAgoId(vps.dockerDiskCheckedAt)}
                </span>
              </div>
            ) : null}
          </div>

          {vps.registeredDomains.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <Globe className="w-3.5 h-3.5" /> Domain Utama
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {vps.registeredDomains.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">{d.name}</span>
                    {d.tracked ? (
                      <DomainExpiryBadge iso={d.expiryDate} />
                    ) : (
                      <Badge variant="warning" size="sm">
                        Belum ada di Pengaturan &gt; Domain
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <HardDrive className="w-3.5 h-3.5" /> Disk Docker (breakdown)
              </span>
              <div className="flex items-center gap-2">
                {!checkingDockerDisk && (
                  <span className="text-[11px] text-slate-400 font-medium">Diperiksa {timeAgoId(vps.dockerDiskCheckedAt)}</span>
                )}
                {isOwner && (
                  <>
                    <Button variant="primary" size="sm" onClick={() => setPruneConfirmOpen(true)} disabled={pruning || checkingDockerDisk}>
                      {pruning ? "Membersihkan..." : "Bersihkan yang Tidak Terpakai"}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setResetBuilderConfirmOpen(true)}
                      disabled={resettingBuilder || checkingDockerDisk}
                    >
                      {resettingBuilder ? "Mereset..." : "Reset Builder Cache"}
                    </Button>
                    {vps.hasCoolify ? (
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Sparkles className="w-4 h-4" />}
                        isLoading={syncing}
                        loadingText="Memproses..."
                        onClick={handleRefreshChecks}
                        disabled={pruning}
                      >
                        Sync & Cek Sekarang
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" onClick={handleCheckDockerDisk} disabled={checkingDockerDisk || pruning}>
                        {checkingDockerDisk ? "Mengecek..." : "Cek Sekarang"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {checkingDockerDisk ? (
              <div className="flex flex-col gap-1.5 py-1">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>{dockerDiskProgressLabel(dockerDiskProgress)}</span>
                  <span>{Math.round(dockerDiskProgress)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full transition-all duration-200" style={{ width: `${dockerDiskProgress}%` }} />
                </div>
                <span className="text-[11px] text-slate-400">Bisa ~30-90 detik (3 command Docker sekaligus lewat SSH + sudo), tergantung beban Docker daemon & jumlah image/volume di VPS-nya.</span>
              </div>
            ) : vps.dockerDisk ? (
              <div className="flex flex-col gap-3">
                {vps.dockerDisk.map((d) => {
                  const totalDockerBytes = (vps.dockerDisk ?? []).reduce((sum, e) => sum + parseDockerSize(e.size), 0)
                  const sizePct = totalDockerBytes > 0 ? (parseDockerSize(d.size) / totalDockerBytes) * 100 : 0
                  const meta = DOCKER_TYPE_META[d.type] ?? { color: "bg-slate-400", description: d.type }
                  const buildkitCacheBytes =
                    d.type === "Local Volumes"
                      ? (vps.dockerVolumes ?? [])
                          .filter((v) => BUILDKIT_CACHE_VOLUME_RE.test(v.name))
                          .reduce((sum, v) => sum + parseDockerSize(v.size), 0)
                      : 0
                  const hasSampah = d.reclaimablePct > 0 || buildkitCacheBytes > 0
                  const sampahLabel = d.reclaimablePct > 0 ? d.reclaimable : formatBytes(buildkitCacheBytes)
                  return (
                    <div key={d.type} className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="w-24 flex-shrink-0 text-xs font-bold text-slate-600">{d.type}</span>
                        <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full ${meta.color}`} style={{ width: `${sizePct > 0 ? Math.max(sizePct, 3) : 0}%` }} />
                        </div>
                        <span className="flex-shrink-0 text-xs font-semibold text-slate-700 text-right">
                          {d.size}
                          {hasSampah ? (
                            <span className="text-amber-600"> · {sampahLabel} sampah</span>
                          ) : (
                            <span className="text-slate-400"> · tidak ada sampah</span>
                          )}
                        </span>
                      </div>
                      <span className="pl-[7.5rem] text-[11px] text-slate-500 font-medium">{meta.description}</span>
                      {d.type === "Local Volumes" && vps.dockerVolumes && vps.dockerVolumes.length > 0 && (
                        <div className="pl-[7.5rem] mt-1 flex flex-col gap-0.5">
                          {[...vps.dockerVolumes]
                            .sort((a, b) => parseDockerSize(b.size) - parseDockerSize(a.size))
                            .slice(0, 8)
                            .map((v) => (
                              <VolumeRow key={v.name} v={v} databases={vps.databases} />
                            ))}
                          {vps.dockerVolumes.length > 8 && (
                            <button
                              onClick={() => setVolumesModalOpen(true)}
                              className="text-left text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                            >
                              +{vps.dockerVolumes.length - 8} volume lainnya
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <span className="text-xs font-medium text-slate-400">
                {vps.hasCoolify
                  ? `Belum pernah dicek${isOwner ? ' — klik "Sync & Cek Sekarang".' : ', minta Owner klik "Sync & Cek Sekarang".'}`
                  : `Belum pernah dicek${isOwner ? ' — klik "Cek Sekarang".' : ', minta Owner klik "Cek Sekarang".'}`}
              </span>
            )}
          </div>

          {vps.applications.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile
                icon={<Box className="w-5 h-5 text-blue-600" />}
                iconClassName="bg-blue-50"
                label="Total Aplikasi"
                value={appStats.total}
                hint="terdaftar di VPS ini"
              />
              <StatTile
                icon={<Database className="w-5 h-5 text-rose-600" />}
                iconClassName="bg-rose-50"
                label="Perlu Backup DB"
                value={appStats.needsBackup}
                hint="perlu ditindaklanjuti"
              />
              <StatTile
                icon={<Clock className="w-5 h-5 text-amber-600" />}
                iconClassName="bg-amber-50"
                label="Domain Akan Habis"
                value={appStats.expiringSoon}
                hint="dalam 30 hari"
              />
              <StatTile
                icon={<TrendingUp className="w-5 h-5 text-indigo-600" />}
                iconClassName="bg-indigo-50"
                label="Aktivitas Hari Ini"
                value={vps.activityToday}
                hint="kunjungan aplikasi"
              />
            </div>
          )}

          {(vps.applications.length > 0 || vps.databases.length > 0) && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Cari nama aplikasi/database, domain, atau project Coolify…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={<Search className="w-4 h-4" />}
                />
              </div>
              {vps.applications.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { value: "all", label: `Semua (${appStats.total})` },
                      { value: "needsBackup", label: `Perlu Backup (${appStats.needsBackup})` },
                      { value: "expiringSoon", label: `Akan Habis (${appStats.expiringSoon})` },
                    ] as const
                  ).map((chip) => (
                    <button
                      key={chip.value}
                      onClick={() => setAppFilterMode(chip.value)}
                      className={`px-3 h-8 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                        appFilterMode === chip.value
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-slate-200/90 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                  <select
                    value={appSortMode}
                    onChange={(e) => setAppSortMode(e.target.value as "terbaru" | "nama")}
                    className="h-8 pl-2.5 pr-6 rounded-full bg-white border border-slate-200/90 text-xs font-bold text-slate-600 cursor-pointer focus:outline-none"
                    aria-label="Urutkan aplikasi"
                  >
                    <option value="terbaru">Urutkan: Terbaru</option>
                    <option value="nama">Urutkan: Nama (A-Z)</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {filteredApplications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 text-center text-slate-400 text-xs font-semibold py-8">
                {vps.applications.length === 0 ? "Belum ada aplikasi terdaftar di VPS ini." : "Tidak ada aplikasi yang cocok dengan pencarian/filter."}
              </div>
            ) : (
              filteredApplications.map((app, index) => (
                <div key={app.id} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 sm:p-5">
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_auto] gap-4 lg:gap-5">
                    {/* Identitas: # + nama + badge, disk usage aplikasi */}
                    <div className="flex gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {(currentAppPage - 1) * PAGE_SIZE + index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{app.name}</span>
                          {app.hasCoolifySync && (
                            <Badge variant="info" size="sm">
                              Coolify
                            </Badge>
                          )}
                          {app.coolifyProjectName && (
                            <Badge variant="primary" size="sm">
                              {app.coolifyProjectName}
                            </Badge>
                          )}
                          {app.coolifyLink && (
                            <a
                              href={app.coolifyLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                              aria-label="Buka di Coolify"
                              title="Buka di Coolify"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="text-xs mt-1">
                          <span className="text-slate-400 font-semibold">Disk App: </span>
                          <DiskContribution usage={app.diskUsage} totalBytes={vps.disk?.totalBytes} />
                        </div>
                      </div>
                    </div>
                    {/* Deploy & Domain: domain+expiry, git+branch */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Deploy &amp; Domain</span>
                      {app.domain ? (
                        <a
                          href={`https://${app.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs break-all"
                        >
                          <span>{app.domain}</span> <ExternalLink className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        </a>
                      ) : (
                        <div className="text-slate-400 text-xs">Tanpa domain</div>
                      )}
                      {app.domain && (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-400 font-semibold">Habis:</span>
                          <DomainExpiryBadge iso={app.domainExpiresAt} />
                        </div>
                      )}
                      {app.gitRepository ? (
                        <a
                          href={app.gitRepository}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs break-all"
                        >
                          <GitBranch className="w-3 h-3 flex-shrink-0" /> {repoDisplayName(app.gitRepository)}
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs block">Tanpa git</span>
                      )}
                      {app.gitBranch && <div className="text-[11px] text-slate-500 font-medium">branch: {app.gitBranch}</div>}
                    </div>
                    {/* Database: info + disk-nya + status backup */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Database</span>
                      <div className="text-xs font-semibold text-slate-700">
                        {app.databaseInfo || <span className="text-slate-400 font-normal">Tanpa database</span>}
                      </div>
                      {app.databaseInfo && (
                        <div className="text-xs">
                          <span className="text-slate-400 font-semibold">Disk DB: </span>
                          <DiskContribution usage={app.databaseDiskUsage} totalBytes={vps.disk?.totalBytes} />
                        </div>
                      )}
                      <div className="flex flex-col items-start gap-1">
                        {app.databaseUuid && isBackupStale(app.dbBackupAt) && (
                          <Badge variant={app.dbBackupAt ? "warning" : "danger"} size="sm">
                            {app.dbBackupAt ? "Backup >1 hari" : "Belum ada backup DB"}
                          </Badge>
                        )}
                        {app.dbBackupAt && !isBackupStale(app.dbBackupAt) && (
                          <span className="text-xs font-semibold text-slate-700">Backup {timeAgoId(app.dbBackupAt)}</span>
                        )}
                        {app.databaseUuid && (
                          <div className="flex items-center gap-2.5">
                            {app.dbBackupLink && (
                              <a
                                href={app.dbBackupLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                              >
                                <ExternalLink className="w-3 h-3" /> Unduh
                              </a>
                            )}
                            {isOwner && (
                              <button
                                onClick={() => handleBackupNow(app.databaseUuid!)}
                                disabled={backingUpDbUuid === app.databaseUuid}
                                className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 font-semibold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Backup Sekarang"
                                title="Trigger backup baru sekarang"
                              >
                                <DatabaseBackup className="w-3 h-3" /> Backup Sekarang
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Aktivitas: terakhir diakses + KPI penggunaan 7 hari */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Terakhir Diakses</span>
                      {app.lastAccessedAt ? (
                        <>
                          <span className="text-xs font-bold text-slate-800">{timeAgoId(app.lastAccessedAt)}</span>
                          <span className="text-[11px] text-slate-500 font-medium">{formatDateTimeId(app.lastAccessedAt)}</span>
                          {app.lastAccessedBy && <span className="text-[11px] text-slate-500 font-medium truncate max-w-[140px]">Oleh: {app.lastAccessedBy}</span>}
                          {app.lastAccessedIp && (
                            <span className="text-[11px] text-slate-400 font-medium truncate max-w-[140px]">
                              {app.lastAccessedIp}
                              {app.lastAccessedCity && ` · ${app.lastAccessedCity}`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">Belum diketahui</span>
                      )}
                      <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Penggunaan 7 Hari</span>
                        <UsageBadge traffic={app.traffic} />
                      </div>
                    </div>
                    {/* Aksi */}
                    <div className="flex lg:flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => setViewingApp(app)} leftIcon={<Eye className="w-3.5 h-3.5" />}>
                        Lihat Detail
                      </Button>
                      {isOwner && (
                        <Button size="sm" variant="outline" onClick={() => openEditApp(app)} leftIcon={<Pencil className="w-3.5 h-3.5" />}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <TablePagination page={currentAppPage} pageCount={appPageCount} total={sortedApplications.length} onChange={setAppPage} />

          {vps.databases.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Database</span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile
                  icon={<Database className="w-5 h-5 text-blue-600" />}
                  iconClassName="bg-blue-50"
                  label="Total Database"
                  value={dbStats.total}
                  hint="di VPS ini"
                />
                <StatTile
                  icon={<Clock className="w-5 h-5 text-rose-600" />}
                  iconClassName="bg-rose-50"
                  label="Perlu Backup"
                  value={dbStats.needsBackup}
                  hint={dbStats.needsBackup === 0 ? "semua sudah di-backup" : "belum di-backup"}
                />
                <StatTile
                  icon={<span className="text-lg">🐘</span>}
                  iconClassName="bg-sky-50"
                  label="PostgreSQL"
                  value={dbStats.postgresql}
                  hint="database aktif"
                />
                <StatTile
                  icon={<span className="text-lg">🦖</span>}
                  iconClassName="bg-amber-50"
                  label="MariaDB"
                  value={dbStats.mariadb}
                  hint="database aktif"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { value: "all", label: `Semua (${dbStats.total})` },
                      { value: "active", label: `Aktif (${dbStats.active})` },
                      { value: "needsBackup", label: `Perlu Backup (${dbStats.needsBackup})` },
                    ] as const
                  ).map((chip) => (
                    <button
                      key={chip.value}
                      onClick={() => setDbFilterMode(chip.value)}
                      className={`px-3 h-8 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                        dbFilterMode === chip.value
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white border-slate-200/90 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                  <select
                    value={dbSortMode}
                    onChange={(e) => setDbSortMode(e.target.value as "terbaru" | "nama")}
                    className="h-8 pl-2.5 pr-6 rounded-full bg-white border border-slate-200/90 text-xs font-bold text-slate-600 cursor-pointer focus:outline-none"
                    aria-label="Urutkan database"
                  >
                    <option value="terbaru">Urutkan: Terbaru</option>
                    <option value="nama">Urutkan: Nama (A-Z)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {filteredDatabases.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 text-center text-slate-400 text-xs font-semibold py-8">
                    Tidak ada database yang cocok dengan pencarian/filter.
                  </div>
                ) : (
                  filteredDatabases.map((db, index) => (
                    <div key={db.uuid} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 sm:p-5">
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_auto] gap-4 lg:gap-5 lg:items-center">
                        {/* Identitas: # + nama + status/project badge */}
                        <div className="flex gap-2.5">
                          <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                            {(currentDbPage - 1) * PAGE_SIZE + index + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900">{db.name}</span>
                              {db.isActive ? (
                                <Badge variant="success" size="sm">Aktif</Badge>
                              ) : (
                                <Badge variant="danger" size="sm">Stop</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              {db.projectName && (
                                <Badge variant="primary" size="sm">
                                  {db.projectName}
                                </Badge>
                              )}
                              {db.coolifyLink && (
                                <a
                                  href={db.coolifyLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-400 hover:text-blue-600 transition-colors"
                                  aria-label="Buka di Coolify"
                                  title="Buka di Coolify"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Tipe */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block lg:hidden">Tipe</span>
                          <span className="text-xs font-semibold text-slate-700">{db.databaseType}</span>
                        </div>
                        {/* Terakhir Aktif */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Terakhir Aktif</span>
                          <span className="text-xs font-semibold text-slate-700">{formatDateTimeId(db.lastOnlineAt)}</span>
                        </div>
                        {/* Ukuran */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Ukuran</span>
                          <div className="text-xs">
                            <DiskContribution usage={db.diskUsage} totalBytes={vps.disk?.totalBytes} />
                          </div>
                        </div>
                        {/* Backup */}
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Backup Terakhir</span>
                          <div className="flex items-center gap-1.5">
                            {db.dbBackupAt && (
                              <span className="text-xs font-semibold text-slate-700">{formatDateTimeId(db.dbBackupAt)}</span>
                            )}
                            {isBackupStale(db.dbBackupAt) && (
                              <Badge variant={db.dbBackupAt ? "warning" : "danger"} size="sm">
                                {db.dbBackupAt ? "Backup >1 hari" : "Belum ada backup"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2.5">
                            {db.dbBackupLink && (
                              <a
                                href={db.dbBackupLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                              >
                                <ExternalLink className="w-3 h-3" /> Unduh
                              </a>
                            )}
                            {isOwner && (
                              <button
                                onClick={() => handleBackupNow(db.uuid)}
                                disabled={backingUpDbUuid === db.uuid}
                                className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-600 font-semibold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Backup Sekarang"
                                title="Trigger backup baru sekarang"
                              >
                                <DatabaseBackup className="w-3 h-3" /> Backup Sekarang
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Aksi */}
                        <div className="flex lg:flex-col gap-2">
                          <Button size="sm" variant="outline" onClick={() => setViewingDb(db)} leftIcon={<Eye className="w-3.5 h-3.5" />}>
                            Lihat Detail
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <TablePagination page={currentDbPage} pageCount={dbPageCount} total={sortedDatabases.length} onChange={setDbPage} />
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={isVpsModalOpen}
        onClose={() => !savingVps && setIsVpsModalOpen(false)}
        title="Edit VPS"
        subtitle="Kredensial SSH & Coolify disimpan di server, dipakai buat cek disk/backup live & sync aplikasi."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsVpsModalOpen(false)} disabled={savingVps}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveVps} isLoading={savingVps} loadingText="Menyimpan...">
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {vpsFormError && <Alert variant="error">{vpsFormError}</Alert>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nama" value={vpsForm.name} onChange={(e) => setVpsForm({ ...vpsForm, name: e.target.value })} />
            <Input label="Host / IP" value={vpsForm.host} onChange={(e) => setVpsForm({ ...vpsForm, host: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="SSH User" value={vpsForm.sshUser} onChange={(e) => setVpsForm({ ...vpsForm, sshUser: e.target.value })} />
            <Input
              label="SSH Port"
              type="number"
              value={vpsForm.sshPort}
              onChange={(e) => setVpsForm({ ...vpsForm, sshPort: e.target.value })}
            />
          </div>
          <Input
            label="SSH Password"
            isPassword
            autoComplete="new-password"
            placeholder="Kosongkan kalau tidak diubah"
            helperText="Isi salah satu: password atau private key"
            value={vpsForm.sshPassword}
            onChange={(e) => setVpsForm({ ...vpsForm, sshPassword: e.target.value })}
          />
          <Textarea
            label="SSH Private Key"
            autoComplete="new-password"
            placeholder="Kosongkan kalau tidak diubah"
            value={vpsForm.sshPrivateKey}
            onChange={(e) => setVpsForm({ ...vpsForm, sshPrivateKey: e.target.value })}
            rows={3}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Disk Path"
              helperText="Mount point yang dicek, default /"
              value={vpsForm.diskPath}
              onChange={(e) => setVpsForm({ ...vpsForm, diskPath: e.target.value })}
            />
            <Input
              label="Path Cek Backup (opsional)"
              placeholder="mis. /root/backups"
              helperText="Folder di VPS itu, file terbaru dicek jadi backup terakhir"
              value={vpsForm.backupCheckPath}
              onChange={(e) => setVpsForm({ ...vpsForm, backupCheckPath: e.target.value })}
            />
          </div>

          <Select
            label="Panel"
            helperText="Disk/RAM/CPU/backup lewat SSH di atas tetap jalan buat semua jenis panel — pilihan ini cuma menentukan cara sync daftar Aplikasi."
            value={vpsForm.panelType}
            onChange={(v) => setVpsForm({ ...vpsForm, panelType: v as "none" | "coolify" | "enhance" })}
            options={[
              { value: "none", label: "Tanpa Panel (Aplikasi diisi manual)" },
              { value: "coolify", label: "Coolify" },
              { value: "enhance", label: "Enhance" },
            ]}
          />

          {vpsForm.panelType === "coolify" && (
            <>
              <Input
                label="Nama Container Proxy"
                helperText='Default Coolify: "coolify-proxy" — dipakai buat cek log akses Traefik'
                value={vpsForm.proxyContainerName}
                onChange={(e) => setVpsForm({ ...vpsForm, proxyContainerName: e.target.value })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Coolify API URL"
                  placeholder="https://coolify.contoh.com/api/v1"
                  value={vpsForm.coolifyApiUrl}
                  onChange={(e) => setVpsForm({ ...vpsForm, coolifyApiUrl: e.target.value })}
                />
                <Input
                  label="Coolify API Token"
                  isPassword
                  autoComplete="new-password"
                  placeholder="Kosongkan kalau tidak diubah"
                  value={vpsForm.coolifyApiToken}
                  onChange={(e) => setVpsForm({ ...vpsForm, coolifyApiToken: e.target.value })}
                />
              </div>
            </>
          )}

          {vpsForm.panelType === "enhance" && (
            <>
              <Alert variant="info">
                Sync otomatis daftar Aplikasi dari Enhance belum tersedia — kredensial ini disimpan buat pengembangan lanjutan. Untuk sekarang,
                tambahkan aplikasi/website VPS ini secara manual lewat tombol &quot;Tambah Aplikasi&quot;.
              </Alert>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Enhance API URL"
                  placeholder="https://panel.contoh.com"
                  value={vpsForm.enhanceApiUrl}
                  onChange={(e) => setVpsForm({ ...vpsForm, enhanceApiUrl: e.target.value })}
                />
                <Input
                  label="Enhance API Token"
                  isPassword
                  autoComplete="new-password"
                  placeholder="Kosongkan kalau tidak diubah"
                  value={vpsForm.enhanceApiToken}
                  onChange={(e) => setVpsForm({ ...vpsForm, enhanceApiToken: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isAppModalOpen}
        onClose={() => !savingApp && setIsAppModalOpen(false)}
        title={editingAppId ? "Edit Aplikasi" : "Tambah Aplikasi"}
        subtitle="Domain & git bisa auto-terisi lewat Sync Coolify. Backup & catatan lain diisi manual."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAppModalOpen(false)} disabled={savingApp}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveApp} isLoading={savingApp} loadingText="Menyimpan...">
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {appFormError && <Alert variant="error">{appFormError}</Alert>}
          <Input label="Nama Aplikasi" value={appForm.name} onChange={(e) => setAppForm({ ...appForm, name: e.target.value })} />
          <Input
            label="Domain"
            placeholder="app.contoh.com"
            value={appForm.domain}
            onChange={(e) => setAppForm({ ...appForm, domain: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Git Repository"
              placeholder="https://github.com/org/repo"
              value={appForm.gitRepository}
              onChange={(e) => setAppForm({ ...appForm, gitRepository: e.target.value })}
            />
            <Input label="Git Branch" placeholder="main" value={appForm.gitBranch} onChange={(e) => setAppForm({ ...appForm, gitBranch: e.target.value })} />
          </div>
          <Input
            label="Lokasi Backup"
            placeholder="mis. Google Drive - folder X, atau belum ada backup"
            value={appForm.backupLocation}
            onChange={(e) => setAppForm({ ...appForm, backupLocation: e.target.value })}
          />
          <Textarea
            label="Query Aktivitas (opsional)"
            placeholder="SELECT email, last_login_at FROM users ORDER BY last_login_at DESC LIMIT 1"
            helperText='Wajib diawali SELECT. Kolom ke-1 = identitas user, kolom ke-2 = timestamp. Dijalankan otomatis waktu "Sync dari Coolify" pakai connection string dari env DATABASE_URL aplikasi ini (tidak disimpan) — hasilnya lebih akurat dari log Traefik, tapi cuma jalan kalau databaseInfo di atas berhasil ke-match.'
            value={appForm.activityQuery}
            onChange={(e) => setAppForm({ ...appForm, activityQuery: e.target.value })}
            rows={2}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Terakhir Backup"
              type="date"
              value={appForm.lastBackupAt}
              onChange={(e) => setAppForm({ ...appForm, lastBackupAt: e.target.value })}
            />
            <Input
              label="Domain Habis (override manual)"
              type="date"
              helperText="Terisi otomatis lewat RDAP kalau kosong & di-Sync"
              value={appForm.domainExpiresAt}
              onChange={(e) => setAppForm({ ...appForm, domainExpiresAt: e.target.value })}
            />
          </div>
          <Select
            label="Paket Disk/Bandwidth (opsional)"
            helperText="Kalau diisi, pemakaian disk (app+database) & bandwidth bulanan dicek terhadap kuota paket ini — muncul di dialog Rincian Kesehatan kalau melebihi."
            placeholder="Tanpa Paket"
            value={appForm.packageId}
            onChange={(v) => setAppForm({ ...appForm, packageId: v })}
            options={packages.map((p) => ({
              value: p.id,
              label: `${p.name} — ${(Number(p.diskSpaceBytes) / 1024 ** 3).toFixed(0)}GB disk / ${(Number(p.bandwidthBytes) / 1024 ** 3).toFixed(0)}GB bandwidth`,
            }))}
          />
          <Textarea label="Catatan" value={appForm.notes} onChange={(e) => setAppForm({ ...appForm, notes: e.target.value })} rows={2} />
        </div>
      </Modal>

      <Modal
        isOpen={volumesModalOpen}
        onClose={() => setVolumesModalOpen(false)}
        title="Semua Local Volumes"
        subtitle={`VPS "${vps.name}" — ${vps.dockerVolumes?.length ?? 0} volume`}
        size="lg"
        footer={
          <Button variant="primary" onClick={() => setVolumesModalOpen(false)}>
            Tutup
          </Button>
        }
      >
        <div className="flex flex-col gap-1">
          {[...(vps.dockerVolumes ?? [])]
            .sort((a, b) => parseDockerSize(b.size) - parseDockerSize(a.size))
            .map((v) => (
              <VolumeRow key={v.name} v={v} databases={vps.databases} />
            ))}
        </div>
      </Modal>

      <Modal
        isOpen={pruneConfirmOpen}
        onClose={() => !pruning && setPruneConfirmOpen(false)}
        title="Bersihkan Docker yang Tidak Terpakai"
        subtitle={`VPS "${vps.name}"`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPruneConfirmOpen(false)} disabled={pruning}>
              Batal
            </Button>
            <Button variant="primary" onClick={runPruneUnused} isLoading={pruning} loadingText="Membersihkan...">
              Bersihkan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700 font-medium">
            Ini akan hapus image lama/dangling, container berhenti, network nganggur, dan cache build BuildKit yang tidak terpakai.
          </p>
          <Alert variant="info">Volume/data aplikasi &amp; database TIDAK pernah disentuh sama sekali — cuma yang benar-benar tidak terpakai.</Alert>
        </div>
      </Modal>

      <Modal isOpen={!!pruneResult} onClose={() => setPruneResult(null)} title={pruneResult?.ok ? "Cleanup Selesai" : "Cleanup Gagal"} subtitle={`VPS "${vps.name}"`} size="lg" footer={<Button variant="primary" onClick={() => setPruneResult(null)}>Tutup</Button>}>
        {pruneResult && (
          <div className="flex flex-col gap-3">
            {pruneResult.ok ? (
              <Alert variant="success">
                Image/container/network: <b>{pruneResult.systemReclaimed || "0B"}</b>
                <br />
                Cache build: <b>{pruneResult.buildxOk ? "dibersihkan" : "GAGAL"}</b> — cek breakdown volume di bawah buat angka sebelum/sesudahnya.
              </Alert>
            ) : (
              <Alert variant="error">{pruneResult.error}</Alert>
            )}
            {!pruneResult.buildxOk && pruneResult.buildxOutput && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-600">Detail cache build (debug)</span>
                <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {pruneResult.buildxOutput}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={resetBuilderConfirmOpen}
        onClose={() => !resettingBuilder && setResetBuilderConfirmOpen(false)}
        title="Reset Builder Cache"
        subtitle={`VPS "${vps.name}"`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetBuilderConfirmOpen(false)} disabled={resettingBuilder}>
              Batal
            </Button>
            <Button variant="primary" onClick={runResetBuilderCache} isLoading={resettingBuilder} loadingText="Mereset...">
              Reset
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700 font-medium">
            Dipakai kalau volume cache builder (<code>buildx_buildkit_*</code>) masih gede padahal "Bersihkan yang Tidak Terpakai"
            sudah dijalankan dan cache-nya sendiri sudah 0B — sisa itu file internal BuildKit yang tidak ke-cover prune biasa.
          </p>
          <p className="text-sm text-slate-700 font-medium">
            Ini akan stop &amp; hapus container builder-nya + volume cache-nya. Coolify otomatis bikin ulang keduanya pas deploy
            berikutnya — build pertama setelah ini sedikit lebih lambat (cache mulai dari kosong), tapi tidak ada data hilang.
          </p>
          <Alert variant="info">Volume/data aplikasi &amp; database TIDAK disentuh — cuma volume cache builder BuildKit.</Alert>
        </div>
      </Modal>

      <Modal
        isOpen={!!resetBuilderResult}
        onClose={() => setResetBuilderResult(null)}
        title={resetBuilderResult?.ok ? "Reset Selesai" : "Reset Gagal"}
        subtitle={`VPS "${vps.name}"`}
        size="lg"
        footer={<Button variant="primary" onClick={() => setResetBuilderResult(null)}>Tutup</Button>}
      >
        {resetBuilderResult && (
          <div className="flex flex-col gap-3">
            {resetBuilderResult.ok ? (
              <Alert variant="success">Builder cache berhasil direset — cek breakdown volume di bawah buat angka sesudahnya.</Alert>
            ) : (
              <Alert variant="error">{resetBuilderResult.error}</Alert>
            )}
            {resetBuilderResult.output && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-600">Detail (debug)</span>
                <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {resetBuilderResult.output}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={healthDetailOpen}
        onClose={() => setHealthDetailOpen(false)}
        title={`Rincian Kesehatan — ${vps.name}`}
        subtitle={`Kesimpulan: ${healthLabel}`}
        size="lg"
      >
        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {(
            [
              { key: "sync", label: "Sinkronisasi", prefix: "coolify-" },
              { key: "resource", label: "Resource Server", prefix: null },
              { key: "db", label: "Database", prefix: "db-" },
              { key: "domain", label: "Domain", prefix: "domain-" },
              { key: "pkg", label: "Paket Aplikasi", prefix: "pkg-" },
            ] as const
          ).map((group) => {
            const items = health.checks.filter((c) =>
              group.prefix
                ? c.key.startsWith(group.prefix)
                : !c.key.startsWith("db-") && !c.key.startsWith("domain-") && !c.key.startsWith("pkg-") && !c.key.startsWith("coolify-")
            )
            if (items.length === 0) return null
            return (
              <div key={group.key} className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  {group.label} {group.key !== "resource" && `(${items.length})`}
                </span>
                <div className="rounded-xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden">
                  {items.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-white/70">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {c.label}
                          {c.informational && <span className="ml-1.5 text-[10px] font-semibold text-slate-400">(info)</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{c.detail}</div>
                      </div>
                      <Badge variant={HEALTH_STATUS_META[c.status].badge} size="sm" className="flex-shrink-0">
                        {HEALTH_STATUS_META[c.status].label}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      <Modal isOpen={!!viewingApp} onClose={() => setViewingApp(null)} title={viewingApp?.name ?? ""} subtitle="Rincian Aplikasi (read-only)" size="lg">
        {viewingApp && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              {viewingApp.hasCoolifySync && <Badge variant="info">Coolify</Badge>}
              {viewingApp.coolifyProjectName && <Badge variant="primary">{viewingApp.coolifyProjectName}</Badge>}
              {viewingApp.coolifyLink && (
                <a
                  href={viewingApp.coolifyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Buka di Coolify
                </a>
              )}
            </div>

            <DetailRow label="Domain" value={viewingApp.domain ? <a href={`https://${viewingApp.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-semibold break-all">{viewingApp.domain}</a> : null} />
            <DetailRow label="Domain Habis" value={viewingApp.domainExpiresAt ? formatDateTimeId(viewingApp.domainExpiresAt) : null} />
            <DetailRow label="Git Repository" value={viewingApp.gitRepository ? <a href={viewingApp.gitRepository} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-semibold break-all">{repoDisplayName(viewingApp.gitRepository)}</a> : null} />
            <DetailRow label="Git Branch" value={viewingApp.gitBranch} />
            <DetailRow label="Database" value={viewingApp.databaseInfo} />
            <DetailRow label="Query Aktivitas Manual" value={viewingApp.activityQuery ? <code className="text-[11px] break-all">{viewingApp.activityQuery}</code> : null} />
            <DetailRow
              label="Backup Database"
              value={viewingApp.dbBackupAt ? formatDateTimeId(viewingApp.dbBackupAt) : viewingApp.databaseUuid ? "Belum ada backup" : null}
            />
            <DetailRow label="Backup Manual (lokasi)" value={viewingApp.backupLocation} />
            <DetailRow label="Backup Manual (terakhir)" value={viewingApp.lastBackupAt ? formatDateTimeId(viewingApp.lastBackupAt) : null} />
            <DetailRow
              label="Terakhir Diakses"
              value={
                viewingApp.lastAccessedAt
                  ? `${formatDateTimeId(viewingApp.lastAccessedAt)}${viewingApp.lastAccessedBy ? ` — oleh ${viewingApp.lastAccessedBy}` : ""}${viewingApp.lastAccessedIp ? ` — ${viewingApp.lastAccessedIp}${viewingApp.lastAccessedCity ? ` (${viewingApp.lastAccessedCity})` : ""}` : ""}`
                  : null
              }
            />
            <DetailRow
              label="Penggunaan 7 Hari"
              value={
                viewingApp.traffic
                  ? `${formatBytes(viewingApp.traffic.bandwidthBytes7d)} · ${viewingApp.traffic.avgVisitorsPerDay.toFixed(1)} kunjungan/hari · ${viewingApp.traffic.activeDays7d}/7 hari aktif`
                  : null
              }
            />
            <DetailRow label="Bandwidth Bulan Ini" value={formatBytes(viewingApp.bandwidthBytesThisMonth)} />
            {viewingApp.package && (
              <DetailRow
                label="Paket"
                value={`${viewingApp.package.name} — ${(Number(viewingApp.package.diskSpaceBytes) / 1024 ** 3).toFixed(0)}GB disk / ${(Number(viewingApp.package.bandwidthBytes) / 1024 ** 3).toFixed(0)}GB bandwidth`}
              />
            )}
            <DetailRow label="Catatan" value={viewingApp.notes} />
            <DetailRow label="Terdaftar Sejak" value={formatDateTimeId(viewingApp.createdAt)} />
          </div>
        )}
      </Modal>

      <Modal isOpen={!!viewingDb} onClose={() => setViewingDb(null)} title={viewingDb?.name ?? ""} subtitle="Rincian Database (read-only)" size="lg">
        {viewingDb && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              {viewingDb.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="danger">Stop</Badge>}
              {viewingDb.projectName && <Badge variant="primary">{viewingDb.projectName}</Badge>}
              {viewingDb.coolifyLink && (
                <a
                  href={viewingDb.coolifyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Buka di Coolify
                </a>
              )}
            </div>

            <DetailRow label="Tipe" value={viewingDb.databaseType} />
            <DetailRow label="Terakhir Aktif" value={viewingDb.lastOnlineAt ? formatDateTimeId(viewingDb.lastOnlineAt) : null} />
            <DetailRow label="Ukuran" value={<DiskContribution usage={viewingDb.diskUsage} totalBytes={vps.disk?.totalBytes} />} />
            <DetailRow label="Backup Terakhir" value={viewingDb.dbBackupAt ? formatDateTimeId(viewingDb.dbBackupAt) : "Belum ada backup"} />
            <DetailRow
              label="Unduh Backup"
              value={
                viewingDb.dbBackupLink ? (
                  <a href={viewingDb.dbBackupLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-semibold">
                    Unduh file backup
                  </a>
                ) : null
              }
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
