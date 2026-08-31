"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeftRight, CheckCircle2, Pencil, Plus, QrCode, Smartphone, Unplug, X } from "lucide-react"

import { Alert, Button, Card, Input, Spinner } from "@/components/ui"
import { AppLogo } from "@/components/ui/AppLogo"
import { ModuleLogoutButton } from "@/components/modules/ModuleLogoutButton"

type Status = "STARTING" | "QR_READY" | "READY" | "FAILED" | "DISCONNECTED"

interface ConnectionState {
  id: string
  label: string | null
  status: Status
  phoneNumber: string | null
}

const STATUS_LABEL: Record<Status, string> = {
  STARTING: "Memulai koneksi…",
  QR_READY: "Scan QR di bawah dengan WhatsApp kamu",
  READY: "Terhubung",
  FAILED: "Gagal terhubung",
  DISCONNECTED: "Belum terhubung",
}

const ConnectionCard: React.FC<{
  connection: ConnectionState
  onReconnect: (id: string) => void
  onDisconnect: (id: string) => void
  onRename: (id: string, label: string) => Promise<void>
  loading: boolean
  qrDataUrl: string | null
}> = ({ connection, onReconnect, onDisconnect, onRename, loading, qrDataUrl }) => {
  const { status } = connection
  const [editing, setEditing] = useState(false)
  const [labelDraft, setLabelDraft] = useState(connection.label ?? "")
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setLabelDraft(connection.label ?? "")
    setEditing(true)
  }

  const saveLabel = async () => {
    if (!labelDraft.trim()) return
    setSaving(true)
    try {
      await onRename(connection.id, labelDraft.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card variant="glass" padding="lg" className="w-full flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
        {status === "READY" ? <CheckCircle2 className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
      </div>
      {editing ? (
        <div className="flex items-center gap-2 w-full max-w-xs">
          <Input
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveLabel()}
            sizeVariant="sm"
            autoFocus
          />
          <Button variant="primary" size="sm" isLoading={saving} onClick={saveLabel}>
            Simpan
          </Button>
          <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 group">
            <p className="text-sm font-black text-slate-900">{connection.label || "WhatsApp"}</p>
            <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>
          {connection.phoneNumber && <p className="text-xs text-slate-500">{connection.phoneNumber}</p>}
        </div>
      )}

      <div className="w-full rounded-2xl border border-slate-200/80 bg-white/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Status</p>
        <p className="text-sm font-bold text-slate-800">{STATUS_LABEL[status]}</p>
      </div>

      {status === "QR_READY" && (
        <div className="p-3 rounded-2xl bg-white border border-slate-200/80">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR Code WhatsApp" className="w-56 h-56" />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center">
              <Spinner />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 w-full">
        {status === "READY" ? (
          <Button
            variant="ghost"
            fullWidth
            leftIcon={<Unplug className="w-4 h-4" />}
            isLoading={loading}
            onClick={() => onDisconnect(connection.id)}
            className="text-rose-600"
          >
            Putuskan Koneksi
          </Button>
        ) : (
          <Button
            variant="primary"
            fullWidth
            leftIcon={<QrCode className="w-4 h-4" />}
            isLoading={loading}
            onClick={() => onReconnect(connection.id)}
          >
            {status === "STARTING" || status === "QR_READY" ? "Refresh QR" : "Hubungkan"}
          </Button>
        )}
      </div>
    </Card>
  )
}

export const ConnectWhatsapp: React.FC = () => {
  const [connections, setConnections] = useState<ConnectionState[]>([])
  const [qrByConnection, setQrByConnection] = useState<Record<string, string | null>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addingLabel, setAddingLabel] = useState<string | null>(null)
  const [initialLoad, setInitialLoad] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshQr = useCallback(async (list: ConnectionState[]) => {
    const targets = list.filter((c) => c.status === "QR_READY")
    if (targets.length === 0) {
      setQrByConnection({})
      return
    }
    const entries = await Promise.all(
      targets.map(async (c) => {
        const res = await fetch(`/api/marketing/whatsapp/connections/${c.id}/qr`)
        const data = await res.json()
        return [c.id, res.ok ? (data.qrDataUrl ?? null) : null] as const
      })
    )
    setQrByConnection(Object.fromEntries(entries))
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }, [])

  const refreshList = useCallback(async () => {
    const res = await fetch("/api/marketing/whatsapp/connections")
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || "Gagal cek status")
      return
    }
    const list: ConnectionState[] = data.connections.map((c: ConnectionState) => ({
      id: c.id,
      label: c.label,
      status: c.status,
      phoneNumber: c.phoneNumber,
    }))
    setConnections(list)
    await refreshQr(list)

    const stillPending = list.some((c) => c.status === "STARTING" || c.status === "QR_READY")
    if (!stillPending) stopPolling()
  }, [refreshQr, stopPolling])

  useEffect(() => {
    refreshList().finally(() => setInitialLoad(false))
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ensurePolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(refreshList, 3000)
  }, [refreshList, stopPolling])

  const handleAddConnection = async () => {
    if (!addingLabel?.trim()) {
      setError("Isi dulu nama/identitas nomor ini (mis. WA Utama)")
      return
    }
    setLoadingId("__new__")
    setError(null)
    try {
      const res = await fetch("/api/marketing/whatsapp/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: addingLabel }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memulai koneksi")
        return
      }
      setAddingLabel(null)
      await refreshList()
      ensurePolling()
    } finally {
      setLoadingId(null)
    }
  }

  const handleReconnect = async (id: string) => {
    setLoadingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/whatsapp/connections/${id}/reconnect`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memulai koneksi")
        return
      }
      await refreshList()
      ensurePolling()
    } finally {
      setLoadingId(null)
    }
  }

  const handleRename = async (id: string, label: string) => {
    setError(null)
    const res = await fetch(`/api/marketing/whatsapp/connections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || "Gagal mengubah nama nomor")
      return
    }
    await refreshList()
  }

  const handleDisconnect = async (id: string) => {
    setLoadingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/whatsapp/connections/${id}/disconnect`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memutus koneksi")
        return
      }
      await refreshList()
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="min-h-screen w-full bg-app-mesh flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
      <div className="flex items-center justify-between">
        <AppLogo size="sm" layout="horizontal" showTagline={false} />
        <div className="flex items-center gap-5">
          <Link href="/modules" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeftRight className="w-4 h-4" /> Ganti Modul
          </Link>
          <ModuleLogoutButton />
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
        <div className="max-w-md w-full text-center flex flex-col items-center gap-2">
          <h1 className="text-xl font-black text-slate-900">Hubungkan WhatsApp</h1>
          <p className="text-sm text-slate-600 font-medium">
            Nomor WhatsApp kamu sendiri — lead yang masuk ke nomor ini otomatis jadi milikmu. Bisa hubungkan lebih dari satu nomor.
          </p>
        </div>

        {error && (
          <div className="max-w-md w-full">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {initialLoad ? (
          <Spinner />
        ) : (
          <div className="w-full max-w-md flex flex-col gap-4">
            {connections.map((c) => (
              <ConnectionCard
                key={c.id}
                connection={c}
                onReconnect={handleReconnect}
                onDisconnect={handleDisconnect}
                onRename={handleRename}
                loading={loadingId === c.id}
                qrDataUrl={qrByConnection[c.id] ?? null}
              />
            ))}

            <Card variant="glass" padding="lg" className="w-full flex flex-col items-center gap-3">
              <Input
                placeholder="Nama nomor (mis. WA Utama)"
                value={addingLabel ?? ""}
                onChange={(e) => setAddingLabel(e.target.value)}
                sizeVariant="sm"
              />
              <Button
                variant="primary"
                fullWidth
                leftIcon={<Plus className="w-4 h-4" />}
                isLoading={loadingId === "__new__"}
                onClick={handleAddConnection}
              >
                Tambah Nomor WhatsApp
              </Button>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
