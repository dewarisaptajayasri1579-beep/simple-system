"use client"

import { useEffect, useState } from "react"
import { Server, HardDrive, Cpu, MemoryStick, Plus, Trash2, Pencil, ExternalLink, GitBranch, ChevronDown, Globe, Sparkles, Users, Search, DatabaseBackup } from "lucide-react"

import { Button, Input, Textarea, Modal, Alert, Badge } from "@/components/ui"
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
  domainExpiresAt: string | null
  domainExpiryCheckedAt: string | null
  notes: string | null
  hasCoolifySync: boolean
  diskUsage: { size: string; virtualSize: string } | null
  databaseDiskUsage: { size: string; virtualSize: string } | null
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
  hasCoolify: boolean
  coolifyApiUrl: string | null
  coolifyDatabaseCount: number | null
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
  databases: {
    uuid: string
    name: string
    databaseType: string
    diskUsage: { size: string; virtualSize: string } | null
    isActive: boolean
    lastOnlineAt: string | null
    dbBackupAt: string | null
    dbBackupLink: string | null
    projectName: string | null
  }[]
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

function DomainExpiryBadge({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-slate-400 text-xs font-semibold">Belum diketahui</span>
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
  const label = `${formatDateOnlyId(iso)}${days >= 0 ? ` (${days} hari lagi)` : " (lewat)"}`
  const variant = days < 0 ? "danger" : days < 30 ? "danger" : days < 90 ? "warning" : "success"
  return <Badge variant={variant}>{label}</Badge>
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

/** Tampilkan ukuran image (virtual size) + kontribusinya ke total disk VPS dalam persen — angka
 *  writable layer (biasanya cuma beberapa KB, kurang bermakna buat non-teknis) SENGAJA tidak
 *  ditampilkan, cuma dipakai buat tooltip. Warna teks kontras (slate-700), bukan abu-abu pudar. */
function DiskContribution({ usage, totalBytes }: { usage: { size: string; virtualSize: string } | null; totalBytes: number | undefined }) {
  if (!usage) return <span className="text-slate-400">-</span>
  const virtualBytes = parseDockerSize(usage.virtualSize)
  const pct = totalBytes ? (virtualBytes / totalBytes) * 100 : null
  return (
    <span className="font-semibold text-slate-700" title={`Writable layer: ${usage.size}`}>
      ~{usage.virtualSize}
      {pct !== null && <span className="text-slate-500"> ({pct < 0.1 ? "<0.1" : pct.toFixed(1)}% dari total)</span>}
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

/** Kesimpulan 1 badge dari semua sinyal yang ada per VPS — supaya kelihatan langsung tanpa expand
 *  card. "Kritis" kalau ada yang beneran rusak/mati (disk/RAM nyaris penuh, database mati, domain
 *  sudah expired); "Perhatian" kalau masih jalan tapi mulai mencurigakan (disk/RAM tinggi, swap
 *  kepake, backup lewat 1 hari, domain mau expired). Ambang sama persis dengan warna tiap mini-bar
 *  individual (≥90 rose, ≥75 amber) supaya konsisten — bukan angka baru yang beda sendiri. */
function computeVpsHealth(vps: VpsRow): { level: VpsHealthLevel; reasons: string[] } {
  const critical: string[] = []
  const warning: string[] = []

  if (vps.disk) {
    if (vps.disk.usedPct >= 90) critical.push(`Disk ${vps.disk.usedPct}% penuh`)
    else if (vps.disk.usedPct >= 75) warning.push(`Disk ${vps.disk.usedPct}% terpakai`)
  }

  if (vps.ram) {
    if (vps.ram.usedPct >= 90) critical.push(`RAM ${vps.ram.usedPct.toFixed(0)}% penuh`)
    else if (vps.ram.usedPct >= 75) warning.push(`RAM ${vps.ram.usedPct.toFixed(0)}% terpakai`)
  }

  if (vps.swap && vps.swap.usedPct > 50) warning.push(`Swap ${vps.swap.usedPct.toFixed(0)}% terpakai`)

  for (const db of vps.databases) {
    if (!db.isActive) critical.push(`Database "${db.name}" mati`)
    else if (isBackupStale(db.dbBackupAt)) warning.push(`Backup "${db.name}" lebih dari 1 hari`)
  }

  for (const d of vps.registeredDomains) {
    if (!d.expiryDate) continue
    const days = Math.floor((new Date(d.expiryDate).getTime() - Date.now()) / 86_400_000)
    if (days < 0) critical.push(`Domain ${d.name} sudah expired`)
    else if (days < 30) warning.push(`Domain ${d.name} habis ${days} hari lagi`)
  }

  if (critical.length > 0) return { level: "kritis", reasons: critical }
  if (warning.length > 0) return { level: "perhatian", reasons: warning }
  return { level: "sehat", reasons: [] }
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
}> = ({ vps, isOwner, expanded, onToggleExpand, onChanged }) => {
  const [syncing, setSyncing] = useState(false)
  const [checkingDockerDisk, setCheckingDockerDisk] = useState(false)
  const [pruning, setPruning] = useState(false)
  const [search, setSearch] = useState("")
  const [appPage, setAppPage] = useState(1)
  const [dbPage, setDbPage] = useState(1)
  useEffect(() => {
    setAppPage(1)
    setDbPage(1)
  }, [search])
  const [backingUpDbUuid, setBackingUpDbUuid] = useState<string | null>(null)
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
    coolifyApiUrl: vps.coolifyApiUrl ?? "",
    coolifyApiToken: "",
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
      coolifyApiUrl: vps.coolifyApiUrl ?? "",
      coolifyApiToken: "",
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
        coolifyApiUrl: vpsForm.coolifyApiUrl.trim(),
        ...(vpsForm.coolifyApiToken.trim() ? { coolifyApiToken: vpsForm.coolifyApiToken.trim() } : {}),
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

  const handleDeleteApp = async (app: AppRow) => {
    if (!confirm(`Hapus aplikasi "${app.name}" dari daftar pantauan?`)) return
    await fetch(`/api/monitoring/applications/${app.id}`, { method: "DELETE" })
    onChanged()
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
  const PAGE_SIZE = 10
  const searchTerm = search.trim().toLowerCase()
  const sortedApplications = [...vps.applications]
    .filter((app) => !searchTerm || [app.name, app.domain, app.coolifyProjectName].some((v) => v?.toLowerCase().includes(searchTerm)))
    .sort((a, b) => Number(isAppUnhealthy(b)) - Number(isAppUnhealthy(a)))
  const appPageCount = Math.max(Math.ceil(sortedApplications.length / PAGE_SIZE), 1)
  // Clamp (bukan cuma pakai appPage mentah) — data bisa berubah (delete/refresh) sampai page
  // lama jadi out-of-range, tanpa ini malah kelihatan "tidak ada hasil" yang menyesatkan.
  const currentAppPage = Math.min(appPage, appPageCount)
  const filteredApplications = sortedApplications.slice((currentAppPage - 1) * PAGE_SIZE, currentAppPage * PAGE_SIZE)

  const sortedDatabases = [...vps.databases]
    .filter((db) => !searchTerm || [db.name, db.projectName].some((v) => v?.toLowerCase().includes(searchTerm)))
    .sort((a, b) => Number(isDbUnhealthy(b)) - Number(isDbUnhealthy(a)))
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
              {vps.hasCoolify ? "Coolify · " : ""}
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
          <Badge variant={healthBadgeVariant} size="sm" title={health.reasons.length > 0 ? health.reasons.join(" · ") : "Semua normal"}>
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
                            .map((v) => {
                              const isCache = BUILDKIT_CACHE_VOLUME_RE.test(v.name)
                              return (
                                <div key={v.name} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className={`font-medium truncate ${isCache ? "text-amber-700" : "text-slate-500"}`} title={v.name}>
                                    {v.name}
                                    {isCache ? <span className="text-amber-600"> · cache builder, aman dihapus</span> : null}
                                  </span>
                                  <span className={`flex-shrink-0 font-semibold ${isCache ? "text-amber-700" : "text-slate-700"}`}>{v.size}</span>
                                </div>
                              )
                            })}
                          {vps.dockerVolumes.length > 8 && (
                            <span className="text-[11px] text-slate-400">+{vps.dockerVolumes.length - 8} volume lainnya</span>
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

          {(vps.applications.length > 0 || vps.databases.length > 0) && (
            <Input
              placeholder="Cari nama aplikasi/database, domain, atau project Coolify…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          )}

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="w-64">Aplikasi</TableHead>
                  <TableHead>Deploy &amp; Database</TableHead>
                  <TableHead className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Aktivitas</TableHead>
                  {isOwner && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isOwner ? 5 : 4} className="text-center text-slate-400 text-xs font-semibold py-6">
                      {vps.applications.length === 0 ? "Belum ada aplikasi terdaftar di VPS ini." : "Tidak ada aplikasi yang cocok dengan pencarian."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApplications.map((app, index) => (
                    <TableRow key={app.id}>
                      <TableCell className="text-slate-400 font-semibold">{index + 1}</TableCell>
                      {/* Identitas: nama + badge, disk usage aplikasi */}
                      <TableCell>
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
                        </div>
                        <div className="text-xs mt-1">
                          <DiskContribution usage={app.diskUsage} totalBytes={vps.disk?.totalBytes} />
                        </div>
                      </TableCell>
                      {/* Deploy & Database: domain+expiry, git+branch, info database + disk-nya, status backup */}
                      <TableCell>
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
                        <div className="mt-1">
                          <DomainExpiryBadge iso={app.domainExpiresAt} />
                        </div>
                        {app.gitRepository ? (
                          <a
                            href={app.gitRepository}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs break-all mt-1.5"
                          >
                            <GitBranch className="w-3 h-3 flex-shrink-0" /> {repoDisplayName(app.gitRepository)}
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs mt-1.5 block">Tanpa git</span>
                        )}
                        {app.gitBranch && <div className="text-[11px] text-slate-500 font-medium">branch: {app.gitBranch}</div>}
                        <div className="text-xs font-semibold text-slate-700 mt-1.5">
                          {app.databaseInfo || <span className="text-slate-400 font-normal">Tanpa database</span>}
                        </div>
                        {app.databaseInfo && (
                          <div className="text-xs mt-0.5">
                            <DiskContribution usage={app.databaseDiskUsage} totalBytes={vps.disk?.totalBytes} />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {app.dbBackupAt ? (
                            <>
                              <span className="text-xs font-semibold text-slate-700">Backup: {formatDateTimeId(app.dbBackupAt)}</span>
                              {app.dbBackupLink && (
                                <a
                                  href={app.dbBackupLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">Belum ada backup</span>
                          )}
                          {isOwner && app.databaseUuid && (
                            <button
                              onClick={() => handleBackupNow(app.databaseUuid!)}
                              disabled={backingUpDbUuid === app.databaseUuid}
                              className="text-slate-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              aria-label="Backup Sekarang"
                              title="Backup Sekarang"
                            >
                              <DatabaseBackup className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      {/* Aktivitas: terakhir diakses + siapa + dari mana */}
                      <TableCell>
                        {app.lastAccessedAt ? (
                          <>
                            <span className="text-xs font-semibold text-slate-700">{formatDateTimeId(app.lastAccessedAt)}</span>
                            {app.lastAccessedBy && <div className="text-[11px] text-slate-500 font-medium truncate max-w-[140px]">{app.lastAccessedBy}</div>}
                            {app.lastAccessedIp && (
                              <div className="text-[11px] text-slate-400 font-medium truncate max-w-[140px]">
                                {app.lastAccessedIp}
                                {app.lastAccessedCity && ` · ${app.lastAccessedCity}`}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">Belum diketahui</span>
                        )}
                      </TableCell>
                      {isOwner && (
                        <TableCell className="text-right whitespace-nowrap">
                          <button
                            onClick={() => openEditApp(app)}
                            className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                            aria-label="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteApp(app)}
                            className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            aria-label="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination page={currentAppPage} pageCount={appPageCount} total={sortedApplications.length} onChange={setAppPage} />

          {vps.databases.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Database</span>
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead>Terakhir Aktif</TableHead>
                      <TableHead>Ukuran</TableHead>
                      <TableHead>DB Backup</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDatabases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-slate-400 text-xs font-semibold py-6">
                          Tidak ada database yang cocok dengan pencarian.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDatabases.map((db, index) => (
                      <TableRow key={db.uuid}>
                        <TableCell className="text-slate-400 font-semibold">{index + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900">{db.name}</span>
                            {db.isActive ? (
                              <Badge variant="success" size="sm">Aktif</Badge>
                            ) : (
                              <Badge variant="danger" size="sm">Stop</Badge>
                            )}
                            {db.projectName && (
                              <Badge variant="primary" size="sm">
                                {db.projectName}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-slate-700">{db.databaseType}</TableCell>
                        <TableCell className="text-xs font-semibold text-slate-700">{formatDateTimeId(db.lastOnlineAt)}</TableCell>
                        <TableCell className="text-xs">
                          <DiskContribution usage={db.diskUsage} totalBytes={vps.disk?.totalBytes} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {db.dbBackupAt ? (
                              <>
                                <span className="text-xs font-semibold text-slate-700">{formatDateTimeId(db.dbBackupAt)}</span>
                                {db.dbBackupLink && (
                                  <a
                                    href={db.dbBackupLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">Belum ada backup</span>
                            )}
                            {isOwner && (
                              <button
                                onClick={() => handleBackupNow(db.uuid)}
                                disabled={backingUpDbUuid === db.uuid}
                                className="text-slate-400 hover:text-blue-600 p-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Backup Sekarang"
                                title="Backup Sekarang"
                              >
                                <DatabaseBackup className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
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
          <Input
            label="Nama Container Proxy"
            helperText='Default Coolify: "coolify-proxy" — dipakai buat cek log akses Traefik'
            value={vpsForm.proxyContainerName}
            onChange={(e) => setVpsForm({ ...vpsForm, proxyContainerName: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Coolify API URL (opsional)"
              placeholder="https://coolify.contoh.com/api/v1"
              value={vpsForm.coolifyApiUrl}
              onChange={(e) => setVpsForm({ ...vpsForm, coolifyApiUrl: e.target.value })}
            />
            <Input
              label="Coolify API Token (opsional)"
              isPassword
              autoComplete="new-password"
              placeholder="Kosongkan kalau tidak diubah"
              value={vpsForm.coolifyApiToken}
              onChange={(e) => setVpsForm({ ...vpsForm, coolifyApiToken: e.target.value })}
            />
          </div>
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
          <Textarea label="Catatan" value={appForm.notes} onChange={(e) => setAppForm({ ...appForm, notes: e.target.value })} rows={2} />
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
    </div>
  )
}
