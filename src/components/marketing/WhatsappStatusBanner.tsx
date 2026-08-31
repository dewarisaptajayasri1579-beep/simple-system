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
  | { kind: "down"; downCount: number; total: number } // ada koneksi, tapi tidak ada yang READY
  | { kind: "unreachable" } // WAHUB tidak merespons — status tak bisa dipastikan

/**
 * Banner yang muncul di Inbox & detail percakapan kalau TIDAK ADA koneksi WhatsApp Sales yang
 * sedang login yang aktif — supaya jelas kenapa pesan tidak masuk/keluar, plus tombol ke halaman
 * hubungkan. Tidak menampilkan apa pun kalau minimal satu koneksi READY (nomor lain masih bisa
 * menerima lead meski salah satu nomor terputus).
 */
export const WhatsappStatusBanner: React.FC<{ className?: string }> = ({ className }) => {
  const [state, setState] = useState<ConnState>({ kind: "loading" })

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/whatsapp/connections", { cache: "no-store" })
      if (res.status === 502) {
        setState({ kind: "unreachable" })
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setState({ kind: "unreachable" })
        return
      }
      const connections: Array<{ status: string }> = data.connections ?? []
      if (connections.length === 0) {
        setState({ kind: "none" })
        return
      }
      const readyCount = connections.filter((c) => c.status === "READY").length
      if (readyCount > 0) {
        setState({ kind: "ready" })
        return
      }
      setState({ kind: "down", downCount: connections.length, total: connections.length })
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
        : `${state.downCount} dari ${state.total} nomor WhatsApp kamu terputus. Pesan lead ke nomor itu berhenti masuk & tidak bisa dibalas sampai tersambung lagi.`

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
