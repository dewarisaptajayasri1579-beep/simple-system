"use client"

import { useCallback, useEffect, useState } from "react"
import { HardDrive, Database, Users, Plus, Trash2, RefreshCw, Archive, ExternalLink, Server, ChevronDown, Sparkles } from "lucide-react"

import { Button, Input, Modal, Alert, Spinner, Badge } from "@/components/ui"
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/Table"
import { VpsServerCard, DiskMiniBar, isBackupStale, type VpsRow, type DiskInfo } from "@/components/monitoring/VpsMonitoring"

type DbSizeRow = {
  id: string
  name: string
  builtin: boolean
  sizeBytes: number | null
  sizePretty: string | null
  error: string | null
}

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  lastLoginAt: string | null
}

type BackupFile = {
  id: string
  name: string
  createdTime: string | null
  sizeBytes: number | null
  webViewLink: string | null
}

const emptyVpsForm = {
  name: "",
  host: "",
  sshPort: "22",
  sshUser: "",
  sshPassword: "",
  sshPrivateKey: "",
  diskPath: "/",
  backupCheckPath: "",
  proxyContainerName: "coolify-proxy",
  coolifyApiUrl: "",
  coolifyApiToken: "",
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Belum pernah login"
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

function formatBytesClient(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return "-"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export const MonitoringDashboard: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const [disk, setDisk] = useState<DiskInfo | null>(null)
  const [diskError, setDiskError] = useState("")
  const [ip, setIp] = useState<string | null>(null)
  const [dbRows, setDbRows] = useState<DbSizeRow[] | null>(null)
  const [dbError, setDbError] = useState("")
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [usersError, setUsersError] = useState("")
  const [backupFiles, setBackupFiles] = useState<BackupFile[] | null>(null)
  const [backupError, setBackupError] = useState("")
  const [vpsList, setVpsList] = useState<VpsRow[] | null>(null)
  const [vpsError, setVpsError] = useState("")
  const [loading, setLoading] = useState(true)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [isAddDbOpen, setIsAddDbOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formConn, setFormConn] = useState("")
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)

  const [isVpsModalOpen, setIsVpsModalOpen] = useState(false)
  const [vpsForm, setVpsForm] = useState(emptyVpsForm)
  const [vpsFormError, setVpsFormError] = useState("")
  const [savingVps, setSavingVps] = useState(false)

  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshSummary, setRefreshSummary] = useState("")

  const loadSelf = useCallback(async () => {
    setDiskError("")
    setDbError("")
    setUsersError("")
    setBackupError("")

    const [diskRes, dbRes, usersRes, backupRes] = await Promise.all([
      fetch("/api/monitoring/disk", { cache: "no-store" }),
      fetch("/api/monitoring/databases", { cache: "no-store" }),
      fetch("/api/monitoring/users", { cache: "no-store" }),
      fetch("/api/monitoring/backup", { cache: "no-store" }),
    ])

    if (diskRes.ok) {
      const data = await diskRes.json()
      setDisk(data.disk)
      setDiskError(data.diskError || "")
      setIp(data.ip)
    } else setDiskError((await diskRes.json().catch(() => null))?.error || "Gagal memuat disk usage")

    if (dbRes.ok) setDbRows(await dbRes.json())
    else setDbError((await dbRes.json().catch(() => null))?.error || "Gagal memuat database")

    if (usersRes.ok) setUsers(await usersRes.json())
    else setUsersError((await usersRes.json().catch(() => null))?.error || "Gagal memuat user")

    if (backupRes.ok) setBackupFiles((await backupRes.json()).files)
    else setBackupError((await backupRes.json().catch(() => null))?.error || "Gagal memuat riwayat backup")
  }, [])

  const loadVps = useCallback(async () => {
    setVpsError("")
    const res = await fetch("/api/monitoring/vps", { cache: "no-store" })
    if (res.ok) setVpsList(await res.json())
    else setVpsError((await res.json().catch(() => null))?.error || "Gagal memuat daftar VPS")
  }, [])

  const loadAll = useCallback(async () => {
    await Promise.all([loadSelf(), loadVps()])
  }, [loadSelf, loadVps])

  useEffect(() => {
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  const handleAddDatabase = async () => {
    setFormError("")
    if (!formName.trim() || !formConn.trim()) {
      setFormError("Nama dan connection string wajib diisi")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/monitoring/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim(), connectionString: formConn.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setFormError(data?.error || "Gagal menambah database")
        return
      }
      setIsAddDbOpen(false)
      setFormName("")
      setFormConn("")
      await loadSelf()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDatabase = async (id: string) => {
    if (!confirm("Hapus database ini dari daftar pantauan?")) return
    await fetch(`/api/monitoring/databases/${id}`, { method: "DELETE" })
    await loadSelf()
  }

  const openAddVps = () => {
    setVpsForm(emptyVpsForm)
    setVpsFormError("")
    setIsVpsModalOpen(true)
  }

  const handleSaveNewVps = async () => {
    setVpsFormError("")
    if (!vpsForm.name.trim() || !vpsForm.host.trim() || !vpsForm.sshUser.trim()) {
      setVpsFormError("Nama, host, dan SSH user wajib diisi")
      return
    }
    if (!vpsForm.sshPassword.trim() && !vpsForm.sshPrivateKey.trim()) {
      setVpsFormError("Isi salah satu: SSH password atau SSH private key")
      return
    }
    setSavingVps(true)
    try {
      const res = await fetch("/api/monitoring/vps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: vpsForm.name.trim(),
          host: vpsForm.host.trim(),
          sshPort: Number(vpsForm.sshPort) || 22,
          sshUser: vpsForm.sshUser.trim(),
          sshPassword: vpsForm.sshPassword.trim(),
          sshPrivateKey: vpsForm.sshPrivateKey.trim(),
          diskPath: vpsForm.diskPath.trim() || "/",
          backupCheckPath: vpsForm.backupCheckPath.trim(),
          proxyContainerName: vpsForm.proxyContainerName.trim() || "coolify-proxy",
          coolifyApiUrl: vpsForm.coolifyApiUrl.trim(),
          coolifyApiToken: vpsForm.coolifyApiToken.trim(),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setVpsFormError(data?.error || "Gagal menambah VPS")
        return
      }
      setIsVpsModalOpen(false)
      await loadVps()
    } finally {
      setSavingVps(false)
    }
  }

  const handleRefreshChecks = async () => {
    setRefreshingAll(true)
    setRefreshSummary("")
    try {
      const res = await fetch("/api/monitoring/vps/refresh-checks", { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        alert(data?.error || "Gagal menjalankan sync & cek")
        return
      }
      setRefreshSummary(
        `Selesai: ${data.coolifySynced} aplikasi di-sync, ${data.domainsChecked} domain expiry ke-update, ${data.accessChecked} terakhir-akses ke-update.`
      )
      await loadVps()
    } finally {
      setRefreshingAll(false)
    }
  }

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  const selfExpanded = expandedId === "self"

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Monitoring Server</h1>
          <p className="text-sm text-slate-600 font-medium">Status & kesehatan semua server yang dipantau.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={() => loadAll()}>
            Refresh
          </Button>
          {isOwner && (
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Sparkles className="w-4 h-4" />}
                isLoading={refreshingAll}
                loadingText="Memproses..."
                onClick={handleRefreshChecks}
              >
                Sync & Cek Sekarang
              </Button>
              <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddVps}>
                Tambah VPS
              </Button>
            </>
          )}
        </div>
      </div>

      {refreshSummary && <Alert variant="success">{refreshSummary}</Alert>}
      {vpsError && <Alert variant="error">{vpsError}</Alert>}

      <div className="flex flex-col gap-3">
        {/* Kartu "Server Ini" — server tempat aplikasi ini sendiri jalan, selalu ada di urutan pertama */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/60 backdrop-blur-md overflow-hidden">
          <button
            onClick={() => toggle("self")}
            className="w-full flex items-center justify-between gap-3 text-left px-4 sm:px-5 py-4 cursor-pointer hover:bg-white/60 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                <Server className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="font-black text-slate-900 truncate">Server Ini</div>
                <div className="text-xs font-semibold text-slate-500 truncate">
                  {ip ? ip : "IP tidak diketahui"} · Aplikasi ini jalan di sini
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <DiskMiniBar disk={disk} diskError={diskError} />
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${selfExpanded ? "rotate-180" : ""}`} />
            </div>
          </button>

          {selfExpanded && (
            <div className="px-4 sm:px-5 pb-5 flex flex-col gap-6 border-t border-slate-200/80 pt-4">
              {/* Disk Space */}
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <HardDrive className="w-3.5 h-3.5" /> Disk Space (/)
                </span>
                {diskError ? (
                  <Alert variant="error">{diskError}</Alert>
                ) : disk ? (
                  <div className="flex flex-col gap-2">
                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${disk.usedPct >= 90 ? "bg-rose-500" : disk.usedPct >= 75 ? "bg-amber-500" : "bg-blue-600"}`}
                        style={{ width: `${Math.min(disk.usedPct, 100)}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-semibold text-slate-700">
                      <span>Terpakai: <span className="font-black">{disk.usedPretty}</span> ({disk.usedPct}%)</span>
                      <span>Tersisa: <span className="font-black">{disk.availablePretty}</span></span>
                      <span>Total: <span className="font-black">{disk.totalPretty}</span></span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Database Space */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                    <Database className="w-3.5 h-3.5" /> Database Space
                  </span>
                  {isOwner && (
                    <Button variant="secondary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsAddDbOpen(true)}>
                      Tambah Database
                    </Button>
                  )}
                </div>
                {dbError ? (
                  <Alert variant="error">{dbError}</Alert>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama</TableHead>
                          <TableHead>Ukuran</TableHead>
                          {isOwner && <TableHead className="text-right">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(dbRows ?? []).map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-bold">{row.name}</TableCell>
                            <TableCell>
                              {row.error ? <span className="text-rose-600 font-semibold text-xs">{row.error}</span> : row.sizePretty}
                            </TableCell>
                            {isOwner && (
                              <TableCell className="text-right">
                                {!row.builtin && (
                                  <button
                                    onClick={() => handleDeleteDatabase(row.id)}
                                    className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                    aria-label="Hapus"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>

              {/* Backup Terakhir */}
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <Archive className="w-3.5 h-3.5" /> Backup Terakhir (Google Drive)
                </span>
                {backupError ? (
                  <Alert variant="error">{backupError}</Alert>
                ) : backupFiles && backupFiles.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-slate-700">
                        Terakhir: <span className="font-black">{formatDateTime(backupFiles[0].createdTime)}</span>
                      </span>
                      {isBackupStale(backupFiles[0].createdTime) ? (
                        <Badge variant="danger" size="sm">Lebih dari 1 hari, cek cron</Badge>
                      ) : (
                        <Badge variant="success" size="sm">Up to date</Badge>
                      )}
                    </div>
                    <TableContainer>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama File</TableHead>
                            <TableHead>Waktu</TableHead>
                            <TableHead>Ukuran</TableHead>
                            <TableHead className="text-right">Link</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {backupFiles.map((f) => (
                            <TableRow key={f.id}>
                              <TableCell className="font-bold">{f.name}</TableCell>
                              <TableCell>{formatDateTime(f.createdTime)}</TableCell>
                              <TableCell>{formatBytesClient(f.sizeBytes)}</TableCell>
                              <TableCell className="text-right">
                                {f.webViewLink && (
                                  <a
                                    href={f.webViewLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                                  >
                                    Buka <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </div>
                ) : (
                  <Alert variant="warning">Belum ada file backup ditemukan di Google Drive.</Alert>
                )}
              </div>

              {/* Login Terakhir */}
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <Users className="w-3.5 h-3.5" /> Login Terakhir
                </span>
                {usersError ? (
                  <Alert variant="error">{usersError}</Alert>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nama</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Login Terakhir</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(users ?? []).map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-bold">{u.name}</TableCell>
                            <TableCell className="text-slate-600">{u.email}</TableCell>
                            <TableCell className="capitalize">{u.role}</TableCell>
                            <TableCell>{formatDateTime(u.lastLoginAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Kartu VPS lain */}
        {(vpsList ?? []).map((vps) => (
          <VpsServerCard
            key={vps.id}
            vps={vps}
            isOwner={isOwner}
            expanded={expandedId === vps.id}
            onToggleExpand={() => toggle(vps.id)}
            onChanged={loadVps}
          />
        ))}
      </div>

      <Modal
        isOpen={isAddDbOpen}
        onClose={() => !saving && setIsAddDbOpen(false)}
        title="Tambah Database Pantauan"
        subtitle="Connection string disimpan di server, dipakai buat cek ukuran database secara berkala."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddDbOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleAddDatabase} isLoading={saving} loadingText="Menyimpan...">
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Input label="Nama" placeholder="mis. Director Assistant" value={formName} onChange={(e) => setFormName(e.target.value)} />
          <Input
            label="Connection String"
            placeholder="postgresql://user:password@host:5432/dbname"
            value={formConn}
            onChange={(e) => setFormConn(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        isOpen={isVpsModalOpen}
        onClose={() => !savingVps && setIsVpsModalOpen(false)}
        title="Tambah VPS"
        subtitle="Kredensial SSH & Coolify disimpan di server, dipakai buat cek disk/backup live & sync aplikasi."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsVpsModalOpen(false)} disabled={savingVps}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveNewVps} isLoading={savingVps} loadingText="Menyimpan...">
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {vpsFormError && <Alert variant="error">{vpsFormError}</Alert>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nama" placeholder="mis. VPS Jakarta 1" value={vpsForm.name} onChange={(e) => setVpsForm({ ...vpsForm, name: e.target.value })} />
            <Input label="Host / IP" placeholder="mis. 168.1.2.3" value={vpsForm.host} onChange={(e) => setVpsForm({ ...vpsForm, host: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="SSH User" placeholder="root" value={vpsForm.sshUser} onChange={(e) => setVpsForm({ ...vpsForm, sshUser: e.target.value })} />
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
            helperText="Isi salah satu: password atau private key"
            value={vpsForm.sshPassword}
            onChange={(e) => setVpsForm({ ...vpsForm, sshPassword: e.target.value })}
          />
          <Input
            label="SSH Private Key"
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
            value={vpsForm.sshPrivateKey}
            onChange={(e) => setVpsForm({ ...vpsForm, sshPrivateKey: e.target.value })}
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
              value={vpsForm.coolifyApiToken}
              onChange={(e) => setVpsForm({ ...vpsForm, coolifyApiToken: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
