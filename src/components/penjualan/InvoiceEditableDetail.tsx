"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  Table,
  TableContainer,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Input,
  Select,
  CurrencyInput,
  Alert,
} from "@/components/ui"
import { Pencil, Plus, Trash2 } from "lucide-react"

function formatDate(date: Date | null) {
  if (!date) return "-"
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(date)
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function toDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : ""
}

interface LineDraft {
  itemId: string | null
  description: string
  qty: number
  unitPrice: number
  unitCost: number
  discountAmount: number
}

const emptyLine = (): LineDraft => ({ itemId: null, description: "", qty: 1, unitPrice: 0, unitCost: 0, discountAmount: 0 })

/** Tampilan + form edit client/tanggal/baris item/diskon/PPN untuk 1 Invoice — cuma dipakai
 *  untuk draft (lihat guard di PATCH /api/invoices/[id]). Sama pola dengan
 *  TransactionDetailFields (Kas Keluar): tombol Edit pensil di bawah kartu, toggle ke form
 *  inline, Batal/Simpan di kanan-bawah — supaya UX-nya konsisten di semua halaman detail. */
export const InvoiceEditableDetail: React.FC<{
  invoiceId: string
  editable: boolean
  clientId: string
  clientName: string
  clientAddress: string
  clientPhone: string
  issuedAt: Date
  dueDate: Date | null
  notes: string
  ppnEnabled: boolean
  ppnRate: number
  discountAmount: number
  subtotal: number
  ppnAmount: number
  totalAmount: number
  paid: number
  remaining: number
  lines: { id: string; itemId: string | null; description: string; qty: number; unitPrice: number; unitCost: number; discountAmount: number; lineTotal: number }[]
}> = ({
  invoiceId,
  editable,
  clientId,
  clientName,
  clientAddress,
  clientPhone,
  issuedAt,
  dueDate,
  notes,
  ppnEnabled,
  ppnRate,
  discountAmount,
  subtotal,
  ppnAmount,
  totalAmount,
  paid,
  remaining,
  lines,
}) => {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [clientOptions, setClientOptions] = useState<{ value: string; label: string }[]>([])
  const [itemOptions, setItemOptions] = useState<{ id: string; name: string; defaultPrice: number; defaultCost: number; unit: string | null }[]>([])
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const [form, setForm] = useState({
    clientId,
    issuedAt: toDateInput(issuedAt),
    dueDate: toDateInput(dueDate),
    notes,
    ppnEnabled,
    ppnRate,
    discountAmount,
  })
  const [formLines, setFormLines] = useState<LineDraft[]>([])

  const openEdit = async () => {
    setForm({ clientId, issuedAt: toDateInput(issuedAt), dueDate: toDateInput(dueDate), notes, ppnEnabled, ppnRate, discountAmount })
    setFormLines(lines.map((l) => ({ itemId: l.itemId, description: l.description, qty: l.qty, unitPrice: l.unitPrice, unitCost: l.unitCost, discountAmount: l.discountAmount })))
    setError("")
    setIsEditing(true)
    setIsLoadingOptions(true)
    try {
      const [clients, items] = await Promise.all([fetch("/api/clients").then((r) => r.json()), fetch("/api/items").then((r) => r.json())])
      setClientOptions(Array.isArray(clients) ? clients.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })) : [])
      setItemOptions(Array.isArray(items) ? items : [])
    } finally {
      setIsLoadingOptions(false)
    }
  }

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setFormLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }
  const pickItemForLine = (index: number, itemId: string) => {
    const item = itemOptions.find((i) => i.id === itemId)
    if (!item) return
    updateLine(index, { itemId: item.id, description: item.name, unitPrice: item.defaultPrice, unitCost: item.defaultCost })
  }
  const addLine = () => setFormLines((prev) => [...prev, emptyLine()])
  const removeLine = (index: number) => setFormLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))

  const itemSelectOptions = useMemo(
    () => itemOptions.map((i) => ({ value: i.id, label: `${i.name}${i.unit ? ` / ${i.unit}` : ""}` })),
    [itemOptions]
  )

  const formSubtotal = formLines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0)
  const formLineDiscount = formLines.reduce((sum, l) => sum + l.discountAmount, 0)
  const formAfterDiscount = Math.max(0, formSubtotal - formLineDiscount - form.discountAmount)
  const formPpnAmount = form.ppnEnabled ? Math.round(formAfterDiscount * (form.ppnRate / 100)) : 0
  const formTotalAmount = formAfterDiscount + formPpnAmount

  const handleSave = async () => {
    if (!form.clientId) {
      setError("Pilih client dulu")
      return
    }
    if (formLines.some((l) => !l.description.trim() || l.unitPrice <= 0)) {
      setError("Tiap baris item wajib ada keterangan & harga")
      return
    }
    setIsSaving(true)
    setError("")
    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dueDate: form.dueDate || null, lines: formLines }),
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
      <div className="mt-6 pt-6 border-t border-slate-200/60 space-y-5">
        {error && (
          <Alert variant="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Client" options={clientOptions} value={form.clientId} onChange={(v) => setForm((f) => ({ ...f, clientId: v }))} placeholder="Pilih client" disabled={isLoadingOptions} />
          <Input label="Tanggal Invoice" type="date" value={form.issuedAt} onChange={(e) => setForm((f) => ({ ...f, issuedAt: e.target.value }))} />
          <Input label="Jatuh Tempo" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
          <Input label="Catatan (opsional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase">Baris Item / Jasa</p>
          {formLines.map((line, index) => (
            <div key={index} className="p-4 rounded-2xl bg-white/60 border border-slate-200/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Baris {index + 1}</span>
                <button type="button" onClick={() => removeLine(index)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Select options={itemSelectOptions} value={line.itemId ?? ""} onChange={(v) => pickItemForLine(index, v)} placeholder="Pilih dari katalog (opsional)" disabled={isLoadingOptions} />
              <Input placeholder="Keterangan" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Input label="Qty" type="number" sizeVariant="sm" value={line.qty} onChange={(e) => updateLine(index, { qty: Number(e.target.value) || 1 })} />
                <CurrencyInput label="Harga Satuan" sizeVariant="sm" value={line.unitPrice} onChange={(v) => updateLine(index, { unitPrice: v })} />
                <CurrencyInput label="HPP Satuan" sizeVariant="sm" value={line.unitCost} onChange={(v) => updateLine(index, { unitCost: v })} />
                <CurrencyInput label="Diskon" sizeVariant="sm" value={line.discountAmount} onChange={(v) => updateLine(index, { discountAmount: v })} />
              </div>
              <p className="text-right text-sm font-bold text-slate-700">Subtotal: {formatRupiah(line.qty * line.unitPrice - line.discountAmount)}</p>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addLine} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Baris
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <CurrencyInput label="Diskon Tambahan" value={form.discountAmount} onChange={(v) => setForm((f) => ({ ...f, discountAmount: v }))} />
          <label className="flex items-center gap-2.5 h-14 px-1 cursor-pointer select-none">
            <input type="checkbox" checked={form.ppnEnabled} onChange={(e) => setForm((f) => ({ ...f, ppnEnabled: e.target.checked }))} className="w-5 h-5" />
            <span className="font-bold text-sm text-slate-700">Kenakan PPN {form.ppnRate}%</span>
          </label>
        </div>

        <div className="pt-4 border-t border-slate-200/60 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatRupiah(formSubtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Diskon</span>
            <span>- {formatRupiah(formLineDiscount + form.discountAmount)}</span>
          </div>
          {form.ppnEnabled && (
            <div className="flex justify-between text-slate-600">
              <span>PPN {form.ppnRate}%</span>
              <span>{formatRupiah(formPpnAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-black text-slate-900 pt-2 border-t border-slate-200/60">
            <span>Total</span>
            <span>{formatRupiah(formTotalAmount)}</span>
          </div>
        </div>

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
          <p className="text-xs font-bold text-slate-500 uppercase">Ditagihkan Kepada</p>
          <p className="font-bold text-slate-900 mt-1">{clientName}</p>
          {clientAddress && <p className="text-sm text-slate-600">{clientAddress}</p>}
          {clientPhone && <p className="text-sm text-slate-600">{clientPhone}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-bold text-slate-500 uppercase">Tanggal Terbit</p>
          <p className="font-semibold text-slate-800">{formatDate(issuedAt)}</p>
          <p className="text-xs font-bold text-slate-500 uppercase mt-2">Jatuh Tempo</p>
          <p className="font-semibold text-slate-800">{formatDate(dueDate)}</p>
        </div>
      </div>

      <div className="mt-6">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keterangan</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead>Diskon</TableHead>
                <TableHead>Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell>{line.qty}</TableCell>
                  <TableCell>{formatRupiah(line.unitPrice)}</TableCell>
                  <TableCell>{formatRupiah(line.discountAmount)}</TableCell>
                  <TableCell className="font-semibold">{formatRupiah(line.lineTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <div className="flex items-center justify-between mt-6">
        {editable ? (
          <Button size="sm" variant="ghost" onClick={openEdit} leftIcon={<Pencil className="w-4 h-4" />}>
            Edit
          </Button>
        ) : (
          <span />
        )}
        <div className="w-full sm:w-72 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Diskon</span>
            <span>- {formatRupiah(discountAmount)}</span>
          </div>
          {ppnEnabled && (
            <div className="flex justify-between text-slate-600">
              <span>PPN {ppnRate}%</span>
              <span>{formatRupiah(ppnAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200/60">
            <span>Total</span>
            <span>{formatRupiah(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold">
            <span>Terbayar</span>
            <span>{formatRupiah(paid)}</span>
          </div>
          <div className="flex justify-between text-rose-700 font-bold">
            <span>Sisa</span>
            <span>{formatRupiah(remaining)}</span>
          </div>
        </div>
      </div>

      {notes && (
        <p className="mt-6 text-sm text-slate-600 border-t border-slate-200/60 pt-4">
          <span className="font-bold">Catatan: </span>
          {notes}
        </p>
      )}
    </>
  )
}
