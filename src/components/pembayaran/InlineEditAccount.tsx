"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Check, X } from "lucide-react"
import { Button, Select } from "@/components/ui"

interface AccountOption {
  id: string
  name: string
}

/** Akun kas/bank yang bisa diedit inline (klik -> jadi dropdown akun) — generik, dipakai di
 *  "Masuk ke Akun" Payment maupun kolom "Akun" tiap baris Biaya di detail Pembayaran draft.
 *  Caller nentuin endpoint lewat `onSave`. */
export const InlineEditAccount: React.FC<{ accountId: string; accountName: string; onSave: (accountId: string) => Promise<void> }> = ({
  accountId: initialAccountId,
  accountName: initialAccountName,
  onSave,
}) => {
  const router = useRouter()
  const [accountId, setAccountId] = useState(initialAccountId)
  const [accountName, setAccountName] = useState(initialAccountName)
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(initialAccountId)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const [accounts, setAccounts] = useState<AccountOption[]>([])

  useEffect(() => {
    if (!isEditing || accounts.length > 0) return
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]))
  }, [isEditing, accounts.length])

  const openEdit = () => {
    setDraft(accountId)
    setError("")
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (draft === accountId) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    setError("")
    try {
      await onSave(draft)
      const picked = accounts.find((a) => a.id === draft)
      setAccountId(draft)
      if (picked) setAccountName(picked.name)
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
      <div className="flex flex-col gap-1 sm:items-end">
        <div className="flex items-center gap-1.5">
          <div className="w-48">
            <Select
              sizeVariant="sm"
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              value={draft}
              onChange={setDraft}
              placeholder="Pilih Kas/Bank"
            />
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
      className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-blue-600 transition-colors cursor-pointer group"
    >
      <span>{accountName}</span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}
