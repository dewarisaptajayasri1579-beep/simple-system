"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Select, CurrencyInput, Alert } from "@/components/ui"
import { Pencil, ArrowRight } from "lucide-react"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Tampilan + form edit Akun Sumber/Tujuan/Nominal/Keterangan untuk 1 Pindah Buku — sama pola
 *  dengan TransactionDetailFields (Kas Keluar), cuma dipakai untuk draft (lihat guard di
 *  PATCH /api/account-transfers/[id]). */
export const AccountTransferDetailFields: React.FC<{
  transferId: string
  editable: boolean
  description: string
  sourceAccountId: string
  sourceAccountName: string
  destinationAccountId: string
  destinationAccountName: string
  amount: number
  accountOptions: { value: string; label: string }[]
}> = ({ transferId, editable, description, sourceAccountId, sourceAccountName, destinationAccountId, destinationAccountName, amount, accountOptions }) => {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({ description, sourceAccountId, destinationAccountId, amount })
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const openEdit = () => {
    setForm({ description, sourceAccountId, destinationAccountId, amount })
    setError("")
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!form.sourceAccountId) {
      setError("Akun sumber wajib dipilih")
      return
    }
    if (!form.destinationAccountId) {
      setError("Akun tujuan wajib dipilih")
      return
    }
    if (form.sourceAccountId === form.destinationAccountId) {
      setError("Akun sumber dan tujuan tidak boleh sama")
      return
    }
    if (!form.amount || form.amount <= 0) {
      setError("Nominal tidak valid")
      return
    }
    setIsSaving(true)
    setError("")
    const res = await fetch(`/api/account-transfers/${transferId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => null)
    setIsSaving(false)
    if (!res.ok) {
      setError(data?.error || "Gagal menyimpan perubahan")
      return
    }
    setIsEditing(false)
    router.refresh()
  }

  if (isEditing) {
    return (
      <div className="mt-6 pt-6 border-t border-slate-200/60 space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        <Input label="Keterangan (opsional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Dari Akun" options={accountOptions} value={form.sourceAccountId} onChange={(v) => setForm((f) => ({ ...f, sourceAccountId: v }))} />
          <Select
            label="Ke Akun"
            options={accountOptions}
            value={form.destinationAccountId}
            onChange={(v) => setForm((f) => ({ ...f, destinationAccountId: v }))}
          />
        </div>
        <CurrencyInput label="Nominal" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setIsEditing(false)}>
            Batal
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
            Simpan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mt-6 pt-6 border-t border-slate-200/60">
        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Pindah Saldo</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Dari</p>
            <p className="font-bold text-slate-900">{sourceAccountName}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Ke</p>
            <p className="font-bold text-slate-900">{destinationAccountName}</p>
          </div>
        </div>
        {description && <p className="text-sm text-slate-600 mt-3">{description}</p>}
      </div>

      <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-200/60">
        {editable ? (
          <Button size="sm" variant="ghost" onClick={openEdit} leftIcon={<Pencil className="w-4 h-4" />}>
            Edit
          </Button>
        ) : (
          <span />
        )}
        <div className="w-full sm:w-72 space-y-1.5 text-sm">
          <div className="flex justify-between text-lg font-black text-slate-900">
            <span>Nominal</span>
            <span>{formatRupiah(amount)}</span>
          </div>
        </div>
      </div>
    </>
  )
}
