"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Check, X } from "lucide-react"
import { Button, CurrencyInput } from "@/components/ui"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Nominal uang yang bisa diedit inline (klik -> jadi CurrencyInput) — dipakai untuk kolom
 *  "Dibayar" (baris invoice) & "Jumlah" (baris Biaya) di detail Pembayaran draft. Generik:
 *  caller nentuin endpoint lewat `onSave`, komponen ini cuma urus state edit + tampilan. */
export const InlineEditAmount: React.FC<{ value: number; onSave: (value: number) => Promise<void> }> = ({ value, onSave }) => {
  const router = useRouter()
  const [current, setCurrent] = useState(value)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const openEdit = () => {
    setDraft(current)
    setError("")
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (draft === current) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    setError("")
    try {
      await onSave(draft)
      setCurrent(draft)
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan, coba lagi.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1 items-end">
        <div className="flex items-center gap-1.5">
          <div className="w-36">
            <CurrencyInput sizeVariant="sm" value={draft} onChange={setDraft} />
          </div>
          <Button size="sm" variant="primary" onClick={handleSave} isLoading={isSaving}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} disabled={isSaving}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={openEdit}
      className="inline-flex items-center gap-1.5 font-semibold hover:text-blue-600 transition-colors cursor-pointer group"
    >
      <span>{formatRupiah(current)}</span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
