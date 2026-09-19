"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus, RefreshCw } from "lucide-react"

import { Button, Input, Modal, Alert, Spinner } from "@/components/ui"
import { VpsServerCard, type VpsRow } from "@/components/monitoring/VpsMonitoring"

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

export const MonitoringDashboard: React.FC<{ isOwner: boolean }> = ({ isOwner }) => {
  const [vpsList, setVpsList] = useState<VpsRow[] | null>(null)
  const [vpsError, setVpsError] = useState("")
  const [loading, setLoading] = useState(true)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [isVpsModalOpen, setIsVpsModalOpen] = useState(false)
  const [vpsForm, setVpsForm] = useState(emptyVpsForm)
  const [vpsFormError, setVpsFormError] = useState("")
  const [savingVps, setSavingVps] = useState(false)

  const loadVps = useCallback(async () => {
    setVpsError("")
    const res = await fetch("/api/monitoring/vps", { cache: "no-store" })
    if (res.ok) setVpsList(await res.json())
    else setVpsError((await res.json().catch(() => null))?.error || "Gagal memuat daftar VPS")
  }, [])

  useEffect(() => {
    loadVps().finally(() => setLoading(false))
  }, [loadVps])

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
              value={vpsForm.coolifyApiToken}
              onChange={(e) => setVpsForm({ ...vpsForm, coolifyApiToken: e.target.value })}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
