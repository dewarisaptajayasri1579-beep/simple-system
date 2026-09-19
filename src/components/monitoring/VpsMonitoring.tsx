"use client"

import { useEffect, useState } from "react"
import { Server, HardDrive, Archive, Plus, Trash2, Pencil, ExternalLink, GitBranch, ChevronDown, Globe } from "lucide-react"

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
  lastAccessedAt: string | null
  lastAccessedBy: string | null
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
  dockerDisk: DockerDiskEntry[] | null
  dockerVolumes: { name: string; size: string }[] | null
  dockerDiskCheckedAt: string | null
  applications: AppRow[]
  registeredDomains: { name: string; tracked: boolean; active: boolean | null; expiryDate: string | null }[]
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
    <div className="flex items-center gap-1.5 w-28">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${disk.usedPct >= 90 ? "bg-rose-500" : disk.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
          style={{ width: `${Math.min(disk.usedPct, 100)}%` }}
        />
      </div>
      <span className="text-[11px] font-bold text-slate-600 flex-shrink-0">{disk.usedPct}%</span>
    </div>
  )
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
  const [pruneConfirmOpen, setPruneConfirmOpen] = useState(false)
  const [pruneResult, setPruneResult] = useState<{
    ok: boolean
    systemReclaimed: string | null
    buildxOk: boolean
    buildxOutput: string
    error?: string
  } | null>(null)
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

  const handleSyncCoolify = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`/api/monitoring/vps/${vps.id}/sync-coolify`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error || "Gagal sync dari Coolify")
        return
      }
      onChanged()
    } finally {
      setSyncing(false)
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
              {vps.sshUser}@{vps.host}:{vps.sshPort}
              {vps.hasCoolify ? " · Coolify" : ""} · {vps.applications.length} aplikasi
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <DiskMiniBar disk={vps.disk} diskError={vps.diskError} />
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
              <Button variant="secondary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddApp}>
                Aplikasi
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<Pencil className="w-4 h-4" />} onClick={openEditVps}>
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

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex flex-col gap-2">
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
                </div>
              ) : null}
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                <Archive className="w-3.5 h-3.5" /> Backup Terakhir (VPS)
              </span>
              {!vps.backupCheckPath ? (
                <span className="text-xs font-semibold text-slate-400">Belum diset (isi &quot;Path Cek Backup&quot; di Edit VPS)</span>
              ) : vps.backupError ? (
                <span className="text-xs font-semibold text-rose-600">{vps.backupError}</span>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-700">
                    {vps.backupLatestFile} · {formatDateTimeId(vps.backupLatestAt)}
                  </span>
                  {isBackupStale(vps.backupLatestAt) ? (
                    <Badge variant="danger" size="sm">
                      Lebih dari 1 hari
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm">
                      Up to date
                    </Badge>
                  )}
                </div>
              )}
            </div>
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
                    <Button variant="secondary" size="sm" onClick={() => setPruneConfirmOpen(true)} disabled={pruning || checkingDockerDisk}>
                      {pruning ? "Membersihkan..." : "Bersihkan yang Tidak Terpakai"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleCheckDockerDisk} disabled={checkingDockerDisk || pruning}>
                      {checkingDockerDisk ? "Mengecek..." : "Cek Sekarang"}
                    </Button>
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
                Belum pernah dicek{isOwner ? ' — klik "Cek Sekarang".' : ", minta Owner klik \"Cek Sekarang\"."}
              </span>
            )}
          </div>

          {isOwner && vps.hasCoolify && (
            <div className="flex items-center justify-end">
              <Button variant="secondary" size="sm" isLoading={syncing} loadingText="Sync..." onClick={handleSyncCoolify}>
                Sync dari Coolify
              </Button>
            </div>
          )}

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Aplikasi</TableHead>
                  <TableHead>Git / Database</TableHead>
                  <TableHead>Diakses / Backup</TableHead>
                  <TableHead>Domain Habis</TableHead>
                  {isOwner && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vps.applications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isOwner ? 6 : 5} className="text-center text-slate-400 text-xs font-semibold py-6">
                      Belum ada aplikasi terdaftar di VPS ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  vps.applications.map((app, index) => (
                    <TableRow key={app.id}>
                      <TableCell className="text-slate-400 font-semibold">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{app.name}</span>
                          {app.hasCoolifySync && (
                            <Badge variant="info" size="sm">
                              Coolify
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs mt-0.5">
                          <DiskContribution usage={app.diskUsage} totalBytes={vps.disk?.totalBytes} />
                        </div>
                      </TableCell>
                      <TableCell>
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
                          <span className="text-slate-400 text-xs">Tanpa git</span>
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
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-slate-700">
                          {formatDateTimeId(app.lastAccessedAt)}
                          {app.lastAccessedBy && <span className="text-slate-400 font-medium"> · {app.lastAccessedBy}</span>}
                        </div>
                        <div className="text-xs font-semibold text-slate-700 mt-0.5">
                          {formatDateTimeId(app.lastBackupAt)}
                          {app.backupLocation && <span className="text-slate-400 font-medium"> · {app.backupLocation}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {app.domain ? (
                          <a
                            href={`https://${app.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                          >
                            {app.domain} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        ) : (
                          <div className="text-slate-400 text-xs">Tanpa domain</div>
                        )}
                        <div className="mt-1">
                          <DomainExpiryBadge iso={app.domainExpiresAt} />
                        </div>
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
    </div>
  )
}
