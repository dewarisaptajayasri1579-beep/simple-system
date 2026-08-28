"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Alert } from "@/components/ui"
import { useVisibilityRefresh } from "./ui"

type ConnState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "none" } // belum pernah menghubungkan WA sama sekali
  | { kind: "down"; status: string } // pernah terhubung, sekarang tidak READY
  | { kind: "unreachable" } // WAHUB tidak merespons — status tak bisa dipastikan

const STATUS_LABEL: Record<string, string> = {
  STARTING: "sedang menyambung",
  QR_READY: "menunggu scan QR",
  FAILED: "gagal / perlu scan ulang",
  DISCONNECTED: "terputus",
}

/**
 * Banner yang muncul di Inbox & detail percakapan kalau koneksi WhatsApp Sales yang sedang
 * login TIDAK aktif — supaya jelas kenapa pesan tidak masuk/keluar, plus tombol ke halaman
 * hubungkan. Tidak menampilkan apa pun kalau koneksi normal (READY).
 */
export const WhatsappStatusBanner: React.FC<{ className?: string }> = ({ className }) => {
  const [state, setState] = useState<ConnState>({ kind: "loading" })

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/whatsapp/status", { cache: "no-store" })
      if (res.status === 502) {
        setState({ kind: "unreachable" })
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setState({ kind: "unreachable" })
        return
      }
      if (!data.connection) {
        setState({ kind: "none" })
        return
      }
      const status: string = data.connection.status
      setState(status === "READY" ? { kind: "ready" } : { kind: "down", status })
    } catch {
      setState({ kind: "unreachable" })
    }
  }, [])

  useEffect(() => {
    check()
    const t = setInterval(check, 60000)
    return () => clearInterval(t)
  }, [check])
  useVisibilityRefresh(check)

  if (state.kind === "loading" || state.kind === "ready") return null

  const body =
    state.kind === "none"
      ? "WhatsApp kamu belum terhubung, jadi pesan lead tidak bisa masuk atau dibalas."
      : state.kind === "unreachable"
        ? "Status WhatsApp tidak bisa dipastikan — server pesan sedang tidak merespons. Pesan mungkin tertunda."
        : `WhatsApp kamu ${STATUS_LABEL[state.status] ?? "tidak terhubung"}. Pesan lead berhenti masuk & tidak bisa dibalas sampai tersambung lagi.`

  return (
    <Link href="/marketing/whatsapp" className={`block ${className ?? ""}`}>
      <Alert variant="warning" className="hover:brightness-[0.98] transition-[filter]">
        <span className="flex items-center justify-between gap-3">
          <span>{body}</span>
          <span className="inline-flex items-center gap-1 font-bold whitespace-nowrap">
            Hubungkan <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </span>
      </Alert>
    </Link>
  )
}
