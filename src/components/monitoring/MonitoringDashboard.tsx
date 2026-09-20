"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, RefreshCw, Package, Pencil, Trash2 } from "lucide-react"

import { Button, Input, Modal, Alert, Spinner, Select } from "@/components/ui"
import { VpsServerCard, type VpsRow, type MonitoringPackageRow } from "@/components/monitoring/VpsMonitoring"

const emptyPackageForm = { name: "", diskSpaceGb: "", bandwidthGb: "" }

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
  panelType: "none" as "none" | "coolify" | "enhance",
  coolifyApiUrl: "",
  coolifyApiToken: "",
  enhanceApiUrl: "",
  enhanceApiToken: "",
  enhanceOrgId: "",
}

export const MonitoringDashboard: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const [vpsList, setVpsList] = useState<VpsRow[] | null>(null)
  const [vpsError, setVpsError] = useState("")
  const [loading, setLoading] = useState(true)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [isVpsModalOpen, setIsVpsModalOpen] = useState(false)
  const [vpsForm, setVpsForm] = useState(emptyVpsForm)
  const [vpsFormError, setVpsFormError] = useState("")
  const [savingVps, setSavingVps] = useState(false)

  const [packages, setPackages] = useState<MonitoringPackageRow[]>([])
  const [isPackageListOpen, setIsPackageListOpen] = useState(false)
  const [isPackageFormOpen, setIsPackageFormOpen] = useState(false)
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null)
  const [packageForm, setPackageForm] = useState(emptyPackageForm)
  const [packageFormError, setPackageFormError] = useState("")
  const [savingPackage, setSavingPackage] = useState(false)

  const loadVps = useCallback(async () => {
    setVpsError("")
    const res = await fetch("/api/monitoring/vps", { cache: "no-store" })
    if (res.ok) setVpsList(await res.json())
    else setVpsError((await res.json().catch(() => null))?.error || "Gagal memuat daftar VPS")
  }, [])

  const loadPackages = useCallback(async () => {
    const res = await fetch("/api/monitoring/packages", { cache: "no-store" })
    if (res.ok) setPackages(await res.json())
  }, [])

  useEffect(() => {
    Promise.all([loadVps(), loadPackages()]).finally(() => setLoading(false))
  }, [loadVps, loadPackages])

  const openAddPackage = () => {
    setEditingPackageId(null)
    setPackageForm(emptyPackageForm)
    setPackageFormError("")
    setIsPackageFormOpen(true)
  }

  const openEditPackage = (pkg: MonitoringPackageRow) => {
    setEditingPackageId(pkg.id)
    setPackageForm({
      name: pkg.name,
      diskSpaceGb: String(Number(pkg.diskSpaceBytes) / 1024 ** 3),
      bandwidthGb: String(Number(pkg.bandwidthBytes) / 1024 ** 3),
    })
    setPackageFormError("")
    setIsPackageFormOpen(true)
  }

  const handleSavePackage = async () => {
    setPackageFormError("")
    if (!packageForm.name.trim() || !packageForm.diskSpaceGb || !packageForm.bandwidthGb) {
      setPackageFormError("Nama, Disk Space, dan Bandwidth wajib diisi")
      return
    }
    setSavingPackage(true)
    try {
      const body = { name: packageForm.name.trim(), diskSpaceGb: Number(packageForm.diskSpaceGb), bandwidthGb: Number(packageForm.bandwidthGb) }
      const res = await fetch(editingPackageId ? `/api/monitoring/packages/${editingPackageId}` : "/api/monitoring/packages", {
        method: editingPackageId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPackageFormError(data?.error || "Gagal menyimpan paket")
        return
      }
      setIsPackageFormOpen(false)
      await loadPackages()
    } finally {
      setSavingPackage(false)
    }
  }

  const handleDeletePackage = async (pkg: MonitoringPackageRow) => {
    if (!confirm(`Hapus paket "${pkg.name}"? Aplikasi yang masih pakai paket ini akan jadi "Tanpa Paket".`)) return
    await fetch(`/api/monitoring/packages/${pkg.id}`, { method: "DELETE" })
    await Promise.all([loadPackages(), loadVps()])
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
          panelType: vpsForm.panelType,
          coolifyApiUrl: vpsForm.coolifyApiUrl.trim(),
          coolifyApiToken: vpsForm.coolifyApiToken.trim(),
          enhanceApiUrl: vpsForm.enhanceApiUrl.trim(),
          enhanceApiToken: vpsForm.enhanceApiToken.trim(),
          enhanceOrgId: vpsForm.enhanceOrgId.trim(),
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

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Monitoring Server</h1>
          <p className="text-sm text-slate-600 font-medium">Status & kesehatan semua server yang dipantau.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={() => loadVps()}>
            Refresh
          </Button>
          {isOwner && (
            <Button variant="secondary" size="sm" leftIcon={<Package className="w-4 h-4" />} onClick={() => setIsPackageListOpen(true)}>
              Kelola Paket
            </Button>
          )}
          {isOwner && (
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddVps}>
              Tambah VPS
            </Button>
          )}
        </div>
      </div>

      {vpsError && <Alert variant="error">{vpsError}</Alert>}

      <div className="flex flex-col gap-3">
        {/* Kartu VPS */}
        {(vpsList ?? []).map((vps) => (
          <VpsServerCard
            key={vps.id}
            vps={vps}
            isOwner={isOwner}
            expanded={expandedId === vps.id}
            onToggleExpand={() => toggle(vps.id)}
            onChanged={loadVps}
            packages={packages}
          />
        ))}
      </div>

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

          <Alert variant="info" title="Yang perlu disetting manual di Coolify (kalau isi API URL/Token di bawah)">
            <ul className="list-disc pl-4 flex flex-col gap-2">
              <li>
                <b>Token API</b>: generate di Coolify VPS ini → <b>Keys &amp; Tokens</b>, centang ability <code>read</code> + <code>read:sensitive</code> +{" "}
                <code>write</code> (butuh <code>write</code> buat auto-setup S3 Storage &amp; jadwal backup di bawah).
              </li>
              <li>
                <b>Access log Traefik</b> (opsional — cuma dibutuhkan buat kolom &quot;Terakhir Diakses&quot; aplikasi yang belum diisi Query
                Aktivitas manual): Coolify → <b>Servers → (server ini) → Proxy → Configuration</b>, tambahkan 2 baris ini di dalam list{" "}
                <code>command:</code>, lalu <b>Restart Proxy</b>:
                <pre className="mt-1.5 text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto">
                  {"      - '--accesslog=true'\n      - '--accesslog.format=json'"}
                </pre>
              </li>
            </ul>
            <p className="mt-2">
              Selain dua itu, semuanya OTOMATIS begitu VPS ini disimpan &amp; kena sync pertama: sync aplikasi &amp; database baru, setup 1 S3
              Storage + jadwal backup harian (21:00) ke bucket R2 yang sama, cek expiry domain, breakdown disk Docker.
            </p>
          </Alert>

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
            autoComplete="new-password"
            helperText="Isi salah satu: password atau private key"
            value={vpsForm.sshPassword}
            onChange={(e) => setVpsForm({ ...vpsForm, sshPassword: e.target.value })}
          />
          <Input
            label="SSH Private Key"
            autoComplete="new-password"
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
                tambahkan aplikasi/website VPS ini secara manual setelah VPS-nya tersimpan.
              </Alert>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Enhance API URL"
                  placeholder="https://panel.contoh.com"
                  value={vpsForm.enhanceApiUrl}
                  onChange={(e) => setVpsForm({ ...vpsForm, enhanceApiUrl: e.target.value })}
                />
                <Input
                  label="Enhance Organization ID"
                  value={vpsForm.enhanceOrgId}
                  onChange={(e) => setVpsForm({ ...vpsForm, enhanceOrgId: e.target.value })}
                />
              </div>
              <Input
                label="Enhance API Token"
                isPassword
                autoComplete="new-password"
                value={vpsForm.enhanceApiToken}
                onChange={(e) => setVpsForm({ ...vpsForm, enhanceApiToken: e.target.value })}
              />
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isPackageListOpen}
        onClose={() => setIsPackageListOpen(false)}
        title="Kelola Paket Disk/Bandwidth"
        subtitle="Di-assign per aplikasi lewat form Tambah/Edit Aplikasi — dicek terhadap pemakaian aktual di dialog Rincian Kesehatan."
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setIsPackageListOpen(false)}>
            Tutup
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Button size="sm" variant="outline" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddPackage} className="self-start">
            Tambah Paket
          </Button>
          {packages.length === 0 ? (
            <p className="text-sm text-slate-500 font-medium">Belum ada paket.</p>
          ) : (
            <div className="rounded-xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden">
              {packages.map((pkg) => (
                <div key={pkg.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white/70">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{pkg.name}</div>
                    <div className="text-xs text-slate-500 font-medium">
                      {(Number(pkg.diskSpaceBytes) / 1024 ** 3).toFixed(0)}GB disk · {(Number(pkg.bandwidthBytes) / 1024 ** 3).toFixed(0)}GB bandwidth/bulan
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditPackage(pkg)}
                      className="text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      aria-label="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePackage(pkg)}
                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      aria-label="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isPackageFormOpen}
        onClose={() => !savingPackage && setIsPackageFormOpen(false)}
        title={editingPackageId ? "Edit Paket" : "Tambah Paket"}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsPackageFormOpen(false)} disabled={savingPackage}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSavePackage} isLoading={savingPackage} loadingText="Menyimpan...">
              Simpan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {packageFormError && <Alert variant="error">{packageFormError}</Alert>}
          <Input label="Nama Paket" placeholder="mis. Paket 1" value={packageForm.name} onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })} />
          <Input
            label="Disk Space (GB)"
            type="number"
            placeholder="5"
            value={packageForm.diskSpaceGb}
            onChange={(e) => setPackageForm({ ...packageForm, diskSpaceGb: e.target.value })}
          />
          <Input
            label="Bandwidth per Bulan (GB)"
            type="number"
            placeholder="50"
            value={packageForm.bandwidthGb}
            onChange={(e) => setPackageForm({ ...packageForm, bandwidthGb: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  )
}
