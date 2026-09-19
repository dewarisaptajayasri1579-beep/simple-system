"use client"

import { useState } from "react"
import { Server, HardDrive, Archive, Plus, Trash2, Pencil, ExternalLink, GitBranch, ChevronDown } from "lucide-react"

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
  backupLocation: string | null
  lastBackupAt: string | null
  lastAccessedAt: string | null
  domainExpiresAt: string | null
  domainExpiryCheckedAt: string | null
  notes: string | null
  hasCoolifySync: boolean
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
  createdAt: string
  disk: DiskInfo | null
  diskError: string | null
  backupLatestFile: string | null
  backupLatestAt: string | null
  backupError: string | null
  applications: AppRow[]
}

const emptyAppForm = {
  vpsServerId: "",
  name: "",
  domain: "",
  gitRepository: "",
  gitBranch: "",
  backupLocation: "",
  lastBackupAt: "",
  domainExpiresAt: "",
  notes: "",
}

export function isBackupStale(iso: string | null) {
  if (!iso) return true
  return Date.now() - new Date(iso).getTime() > 30 * 60 * 60 * 1000
}

function DomainExpiryBadge({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-slate-400 text-xs font-semibold">Belum diketahui</span>
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
  const label = `${formatDateOnlyId(iso)}${days >= 0 ? ` (${days} hari lagi)` : " (lewat)"}`
  const variant = days < 0 ? "danger" : days < 30 ? "danger" : days < 90 ? "warning" : "success"
  return <Badge variant={variant}>{label}</Badge>
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
          {isOwner && (
            <div className="flex items-center gap-1.5 justify-end flex-wrap">
              {vps.hasCoolify && (
                <Button variant="secondary" size="sm" isLoading={syncing} loadingText="Sync..." onClick={handleSyncCoolify}>
                  Sync dari Coolify
                </Button>
              )}
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
                  <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${vps.disk.usedPct >= 90 ? "bg-rose-500" : vps.disk.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
                      style={{ width: `${Math.min(vps.disk.usedPct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">
                    {vps.disk.usedPretty} / {vps.disk.totalPretty} ({vps.disk.usedPct}%)
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

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aplikasi</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Git</TableHead>
                  <TableHead>Terakhir Diakses</TableHead>
                  <TableHead>Terakhir Backup</TableHead>
                  <TableHead>Domain Habis</TableHead>
                  {isOwner && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vps.applications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isOwner ? 7 : 6} className="text-center text-slate-400 text-xs font-semibold py-6">
                      Belum ada aplikasi terdaftar di VPS ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  vps.applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-bold">
                        {app.name}
                        {app.hasCoolifySync && (
                          <Badge variant="info" size="sm" className="ml-1.5">
                            Coolify
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {app.domain ? (
                          <a
                            href={`https://${app.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                          >
                            {app.domain} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {app.gitRepository ? (
                          <a
                            href={app.gitRepository}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs max-w-[160px] truncate"
                          >
                            <GitBranch className="w-3 h-3 flex-shrink-0" /> {app.gitBranch || "repo"}
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{formatDateTimeId(app.lastAccessedAt)}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        {formatDateTimeId(app.lastBackupAt)}
                        {app.backupLocation && <div className="text-slate-400 font-medium">{app.backupLocation}</div>}
                      </TableCell>
                      <TableCell>
                        <DomainExpiryBadge iso={app.domainExpiresAt} />
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
            placeholder="Kosongkan kalau tidak diubah"
            helperText="Isi salah satu: password atau private key"
            value={vpsForm.sshPassword}
            onChange={(e) => setVpsForm({ ...vpsForm, sshPassword: e.target.value })}
          />
          <Textarea
            label="SSH Private Key"
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
    </div>
  )
}
