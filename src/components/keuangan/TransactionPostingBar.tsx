"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button, Alert } from "@/components/ui"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { JournalButton } from "@/components/akuntansi/JournalButton"
import { VoidButton } from "@/components/akuntansi/VoidButton"
import type { JournalSource } from "@/components/akuntansi/JournalPreviewModal"

/** Posting/Hapus/Batalkan 1 Transaction (Kas Keluar/Kas Masuk manual, atau hasil Bayar
 *  Domain/Server/Maintenance/Biaya Berkala) — dipindah dari kolom "Aksi" di tabel Riwayat ke
 *  sini (detail), sama pola dengan PaymentPostingBar. Kalau transaksi ini bagian dari 1
 *  Payment (Pembayaran), semua aksi kelola cuma bisa lewat menu Pembayaran — di sini cuma
 *  tampil status + "Lihat Jurnal" + link ke kwitansinya. */
export const TransactionPostingBar: React.FC<{
  transactionId: string
  postStatus: "draft" | "posted" | "voided"
  sources: JournalSource[]
  managedByPaymentId: string | null
  isOwner: boolean
}> = ({ transactionId, postStatus, sources, managedByPaymentId, isOwner }) => {
  const router = useRouter()
  const [status, setStatus] = useState(postStatus)
  const [posting, setPosting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  const handlePost = async () => {
    setPosting(true)
    setError("")
    const res = await fetch(`/api/transactions/${transactionId}/post`, { method: "POST" })
    const data = await res.json().catch(() => null)
    setPosting(false)
    if (!res.ok) {
      setError(data?.error || "Gagal posting transaksi")
      return
    }
    setStatus("posted")
    router.refresh()
  }

  const handleDelete = async () => {
    if (!confirm("Hapus draft transaksi ini? Kalau salah input, ini cara paling gampang untuk input ulang dari awal.")) return
    setDeleting(true)
    setError("")
    const res = await fetch(`/api/transactions/${transactionId}`, { method: "DELETE" })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setDeleting(false)
      setError(data?.error || "Gagal menghapus draft transaksi")
      return
    }
    router.back()
    router.refresh()
  }

  return (
    <div className="no-print space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge type={status} size="sm" />
        <JournalButton title="Jurnal Transaksi" sources={sources} postUrl={!managedByPaymentId && status === "draft" ? `/api/transactions/${transactionId}/post` : undefined} />
        {managedByPaymentId ? (
          <Link href={`/pembayaran/${managedByPaymentId}`} className="text-xs font-semibold text-blue-600 hover:underline">
            Bagian dari kwitansi Pembayaran — kelola di sana
          </Link>
        ) : (
          <>
            {status === "draft" && (
              <>
                <Button size="sm" variant="primary" onClick={handlePost} isLoading={posting}>
                  Posting
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="!text-rose-700 !border-rose-300 hover:!bg-rose-50"
                  onClick={handleDelete}
                  isLoading={deleting}
                >
                  Hapus
                </Button>
              </>
            )}
            {status === "posted" && isOwner && (
              <VoidButton voidUrl={`/api/transactions/${transactionId}/void`} itemLabel="transaksi ini" onVoided={() => setStatus("voided")} />
            )}
          </>
        )}
      </div>
      {error && (
        <Alert variant="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
    </div>
  )
}
