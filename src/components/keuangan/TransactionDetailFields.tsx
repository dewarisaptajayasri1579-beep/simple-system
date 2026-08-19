"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Select, CurrencyInput, Alert } from "@/components/ui"
import { Pencil } from "lucide-react"

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

/** Tampilan + form edit Keterangan/Akun/Kategori/Nominal untuk 1 Transaction Kas Keluar —
 *  cuma dipakai untuk draft pengeluaran manual (lihat guard di PATCH /api/transactions/[id]).
 *  Baris "Bayar Domain/Server/Maintenance/Biaya Berkala" dan yang sudah posting tetap
 *  read-only, kelola lewat Posting/Hapus di TransactionPostingBar seperti biasa. */
export const TransactionDetailFields: React.FC<{
  transactionId: string
  editable: boolean
  /** True buat baris Bayar Domain/Server/Maintenance/Biaya Berkala — kategori/akun Beban-nya
   *  ngikut item terkait, bukan pilihan bebas, jadi selector Kategori disembunyikan pas edit. */
  categoryLocked?: boolean
  description: string
  accountId: string
  accountName: string
  categoryId: string
  categoryName: string
  grossAmount: number
  accountOptions: { value: string; label: string }[]
  categoryOptions: { value: string; label: string }[]
}> = ({ transactionId, editable, categoryLocked, description, accountId, accountName, categoryId, categoryName, grossAmount, accountOptions, categoryOptions }) => {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({ description, accountId, categoryId, grossAmount })
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const openEdit = () => {
    setForm({ description, accountId, categoryId, grossAmount })
    setError("")
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (!form.accountId) {
      setError("Akun kas/bank wajib dipilih")
      return
    }
    if (!form.grossAmount || form.grossAmount <= 0) {
      setError("Nominal tidak valid")
      return
    }
    setIsSaving(true)
    setError("")
    const res = await fetch(`/api/transactions/${transactionId}`, {
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
        <Input label="Keterangan" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Akun" options={accountOptions} value={form.accountId} onChange={(v) => setForm((f) => ({ ...f, accountId: v }))} />
          {categoryLocked ? (
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-700 mb-1.5">Kategori Biaya</p>
              <p className="text-sm font-semibold text-slate-500 px-3 py-2 rounded-xl bg-slate-100/70 border border-slate-200/80">
                {categoryName || "Mengikuti item terkait"} <span className="font-normal text-xs">(tidak bisa diganti)</span>
              </p>
            </div>
          ) : (
            <Select
              label="Kategori Biaya"
              options={categoryOptions}
              value={form.categoryId}
              onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              placeholder="Tanpa kategori"
            />
          )}
        </div>
        <CurrencyInput label="Nominal" value={form.grossAmount} onChange={(v) => setForm((f) => ({ ...f, grossAmount: v }))} />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200/60">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase">Keterangan</p>
          <p className="font-bold text-slate-900 mt-1">{description || "-"}</p>
          {categoryName && <p className="text-sm text-slate-600">{categoryName}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-bold text-slate-500 uppercase">Akun</p>
          <p className="font-semibold text-slate-800">{accountName}</p>
        </div>
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
            <span>Jumlah</span>
            <span>{formatRupiah(grossAmount)}</span>
          </div>
        </div>
      </div>
    </>
  )
}
