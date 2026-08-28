"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowLeftRight, CheckCircle2, QrCode, Smartphone, Unplug } from "lucide-react"

import { Alert, Button, Card, Spinner } from "@/components/ui"
import { AppLogo } from "@/components/ui/AppLogo"
import { ModuleLogoutButton } from "@/components/modules/ModuleLogoutButton"

type Status = "STARTING" | "QR_READY" | "READY" | "FAILED" | "DISCONNECTED"

interface ConnectionState {
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

export const ConnectWhatsapp: React.FC = () => {
  const [connection, setConnection] = useState<ConnectionState | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }, [])

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/marketing/whatsapp/status")
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || "Gagal cek status")
      return
    }
    setConnection(data.connection ? { status: data.connection.status, phoneNumber: data.connection.phoneNumber } : null)

    if (data.connection?.status === "QR_READY") {
      const qrRes = await fetch("/api/marketing/whatsapp/qr")
      const qrData = await qrRes.json()
      if (qrRes.ok) setQrDataUrl(qrData.qrDataUrl)
    } else {
      setQrDataUrl(null)
    }

    if (data.connection?.status === "READY" || data.connection?.status === "FAILED") {
      stopPolling()
    }
  }, [stopPolling])

  useEffect(() => {
    refreshStatus()
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/marketing/whatsapp/connect", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memulai koneksi")
        return
      }
      setConnection({ status: data.status, phoneNumber: data.phoneNumber })
      stopPolling()
      pollRef.current = setInterval(refreshStatus, 3000)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/marketing/whatsapp/disconnect", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memutus koneksi")
        return
      }
      stopPolling()
      setConnection({ status: data.connection.status, phoneNumber: data.connection.phoneNumber })
      setQrDataUrl(null)
    } finally {
      setLoading(false)
    }
  }

  const status = connection?.status ?? "DISCONNECTED"

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

      <main className="flex-1 flex items-center justify-center">
        <Card variant="glass" padding="lg" className="max-w-md w-full text-center flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            {status === "READY" ? <CheckCircle2 className="w-7 h-7" /> : <Smartphone className="w-7 h-7" />}
          </div>
          <h1 className="text-xl font-black text-slate-900">Hubungkan WhatsApp</h1>
          <p className="text-sm text-slate-600 font-medium">
            Nomor WhatsApp kamu sendiri — lead yang masuk ke nomor ini otomatis jadi milikmu.
          </p>

          {error && <Alert variant="error">{error}</Alert>}

          <div className="w-full rounded-2xl border border-slate-200/80 bg-white/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Status</p>
            <p className="text-sm font-bold text-slate-800">{STATUS_LABEL[status]}</p>
            {connection?.phoneNumber && <p className="text-xs text-slate-500 mt-1">{connection.phoneNumber}</p>}
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

          {status === "READY" && (
            <Link href="/marketing" className="w-full">
              <Button variant="primary" fullWidth leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Kembali ke Aplikasi
              </Button>
            </Link>
          )}

          <div className="flex items-center gap-3 w-full">
            {status === "READY" ? (
              <Button variant="ghost" fullWidth leftIcon={<Unplug className="w-4 h-4" />} isLoading={loading} onClick={handleDisconnect} className="text-rose-600">
                Putuskan Koneksi
              </Button>
            ) : (
              <Button variant="primary" fullWidth leftIcon={<QrCode className="w-4 h-4" />} isLoading={loading} onClick={handleConnect}>
                {status === "STARTING" || status === "QR_READY" ? "Refresh QR" : "Hubungkan WhatsApp"}
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  )
}
