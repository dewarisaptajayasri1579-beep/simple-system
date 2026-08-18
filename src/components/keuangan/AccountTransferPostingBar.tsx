"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Alert } from "@/components/ui"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { JournalButton } from "@/components/akuntansi/JournalButton"
import { VoidButton } from "@/components/akuntansi/VoidButton"

/** Posting/Hapus/Batalkan 1 Pindah Buku — sama pola dengan TransactionPostingBar, cuma lebih
 *  sederhana (Pindah Buku tidak pernah jadi bagian dari Payment). */
export const AccountTransferPostingBar: React.FC<{
  transferId: string
  postStatus: "draft" | "posted" | "voided"
  journalEntryId: string | null
  isOwner: boolean
}> = ({ transferId, postStatus, journalEntryId, isOwner }) => {
  const router = useRouter()
  const [status, setStatus] = useState(postStatus)
  const [posting, setPosting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  const handlePost = async () => {
    setPosting(true)
    setError("")
    const res = await fetch(`/api/account-transfers/${transferId}/post`, { method: "POST" })
    const data = await res.json().catch(() => null)
    setPosting(false)
    if (!res.ok) {
      setError(data?.error || "Gagal posting Pindah Buku")
      return
    }
    setStatus("posted")
    router.refresh()
  }

  const handleDelete = async () => {
    if (!confirm("Hapus draft Pindah Buku ini? Kalau salah input, ini cara paling gampang untuk input ulang dari awal.")) return
    setDeleting(true)
    setError("")
    const res = await fetch(`/api/account-transfers/${transferId}`, { method: "DELETE" })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setDeleting(false)
      setError(data?.error || "Gagal menghapus draft Pindah Buku")
      return
    }
    router.push("/keuangan/pindah-buku")
    router.refresh()
  }

  return (
    <div className="no-print space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge type={status} size="sm" />
        <JournalButton
          title="Jurnal Pindah Buku"
          sources={[journalEntryId ? { entryId: journalEntryId } : { sourceType: "transfer", sourceId: transferId }]}
          postUrl={status === "draft" ? `/api/account-transfers/${transferId}/post` : undefined}
        />
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
          <VoidButton voidUrl={`/api/account-transfers/${transferId}/void`} itemLabel="Pindah Buku ini" onVoided={() => setStatus("voided")} />
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
