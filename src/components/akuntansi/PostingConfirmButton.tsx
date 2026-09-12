"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Modal, Alert } from "@/components/ui"
import { PostingPreviewBody, usePostingPreview, type PostingPreviewKind } from "./PostingPreview"

export interface PostingConfirmButtonProps {
  /** Jenis transaksi — menentukan resume & kalimat konfirmasi apa yang dihitung server
   *  (lihat src/lib/accounting/posting-preview.ts). */
  previewKind: PostingPreviewKind
  previewId: string
  /** Endpoint posting transaksi induknya (BUKAN endpoint jurnal) supaya semua efek ikutannya
   *  — status invoice, lastPaidAt, sisa kasbon — tetap jalan. */
  postUrl: string
  label?: string
  size?: "sm" | "md"
  variant?: "primary" | "outline" | "ghost"
  disabled?: boolean
  /** Body tambahan untuk POST-nya (dipakai Slotting Omset: feeOverrides). */
  postBody?: Record<string, unknown>
  /** Diteruskan ke preview — dipakai Slotting Omset supaya nominal di resume ikut checkbox
   *  biaya admin yang sedang dipilih staf, bukan default-nya. */
  previewFeeOverrides?: Record<string, boolean>
  /** Dipanggil setelah posting berhasil, sebelum router.refresh(). */
  onPosted?: (data: unknown) => void
  className?: string
}

/** Tombol "Posting" standar untuk SEMUA transaksi keuangan: tidak pernah langsung mengeksekusi,
 *  selalu membuka dialog berisi resume inputan + proyeksi saldo kas/bank setelah posting, dan
 *  mengunci tombol konfirmasi kalau saldo akun jadi minus (aturan yang sama ditegakkan lagi di
 *  server oleh cash-guard.ts — dialog ini cuma supaya staf tahu sebelum menekan, bukan
 *  satu-satunya penjaga). */
export const PostingConfirmButton: React.FC<PostingConfirmButtonProps> = ({
  previewKind,
  previewId,
  postUrl,
  label = "Posting",
  size = "sm",
  variant = "primary",
  disabled,
  postBody,
  previewFeeOverrides,
  onPosted,
  className,
}) => {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState("")
  const { preview, loading, error: previewError } = usePostingPreview(previewKind, previewId, open, previewFeeOverrides)

  const handleConfirm = async () => {
    setPosting(true)
    setError("")
    const res = await fetch(postUrl, {
      method: "POST",
      ...(postBody ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(postBody) } : {}),
    })
    const data = await res.json().catch(() => null)
    setPosting(false)
    if (!res.ok) {
      setError(data?.error || "Gagal posting")
      return
    }
    setOpen(false)
    onPosted?.(data)
    router.refresh()
  }

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} disabled={disabled} className={className}>
        {label}
      </Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={preview?.title ?? "Konfirmasi Posting"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleConfirm} isLoading={posting} disabled={!preview || preview.blocked}>
              {preview?.confirmLabel ?? "Ya, Posting"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <Alert variant="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
          <PostingPreviewBody preview={preview} loading={loading} error={previewError} />
        </div>
      </Modal>
    </>
  )
}
