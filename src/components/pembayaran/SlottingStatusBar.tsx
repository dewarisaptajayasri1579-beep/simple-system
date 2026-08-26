"use client"

import { useState } from "react"
import Link from "next/link"
import { Badge, Button } from "@/components/ui"

export interface SlottingStatusBarProps {
  revenueSlotId: string
  status: "draft" | "processed" | "skipped"
  isOwner: boolean
}

const STATUS_BADGE: Record<SlottingStatusBarProps["status"], { label: string; variant: "warning" | "success" | "secondary" }> = {
  draft: { label: "Belum Split", variant: "warning" },
  processed: { label: "Sudah Split", variant: "success" },
  skipped: { label: "Tidak Split", variant: "secondary" },
}

/** Status Slotting Omset payment ini — muncul di halaman detail Pembayaran begitu payment
 *  posted (RevenueSlot dibuat otomatis, lihat POST /api/payments/[id]/post). Tombol "Tidak
 *  Split" cuma buat kasus payment yang memang bukan pendapatan project (mis. reimbursement),
 *  supaya tidak nyangkut terus di antrean Keuangan > Slotting Omset. */
export const SlottingStatusBar: React.FC<SlottingStatusBarProps> = ({ revenueSlotId, status: initialStatus, isOwner }) => {
  const [status, setStatus] = useState(initialStatus)
  const [isSkipping, setIsSkipping] = useState(false)
  const [error, setError] = useState("")

  const handleSkip = async () => {
    if (!confirm("Tandai payment ini TIDAK di-split? Tidak ada Pindah Buku yang akan dibuat.")) return
    setIsSkipping(true)
    setError("")
    const res = await fetch(`/api/revenue-slots/${revenueSlotId}/skip`, { method: "POST" })
    const data = await res.json()
    setIsSkipping(false)
    if (!res.ok) {
      setError(data.error || "Gagal menandai")
      return
    }
    setStatus("skipped")
  }

  const badge = STATUS_BADGE[status]

  return (
    <div className="no-print flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/70 border border-slate-200/80">
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-bold text-slate-500 uppercase">Slotting Omset</span>
        <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
        {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
      </div>
      {isOwner && status === "draft" && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleSkip} isLoading={isSkipping}>
            Tidak Split
          </Button>
          <Link href={`/keuangan/slotting-omset/${revenueSlotId}`}>
            <Button size="sm" variant="primary">Slotting Omset</Button>
          </Link>
        </div>
      )}
      {status === "processed" && (
        <Link href={`/keuangan/slotting-omset/${revenueSlotId}`}>
          <Button size="sm" variant="outline">Slotting Omset</Button>
        </Link>
      )}
    </div>
  )
}
