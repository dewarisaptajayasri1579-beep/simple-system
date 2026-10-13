"use client"

import React, { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button, Card, Input, Select } from "@/components/ui"

export interface WorkPriceItemRow {
  id: string
  groupName: string
  level: string | null
  label: string
  price: number
}

interface CartRow {
  key: string
  itemId: string
  qty: number
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export function KalkulatorHargaPanel({ items }: { items: WorkPriceItemRow[] }) {
  const [rows, setRows] = useState<CartRow[]>([{ key: crypto.randomUUID(), itemId: items[0]?.id ?? "", qty: 1 }])

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

  const options = useMemo(
    () =>
      items.map((i) => ({
        value: i.id,
        label: `${i.groupName}${i.level ? ` - ${i.level}` : ""} — ${formatRupiah(i.price)}`,
      })),
    [items]
  )

  const total = rows.reduce((sum, r) => sum + (itemsById.get(r.itemId)?.price ?? 0) * r.qty, 0)

  function addRow() {
    setRows((prev) => [...prev, { key: crypto.randomUUID(), itemId: items[0]?.id ?? "", qty: 1 }])
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev))
  }

  function updateRow(key: string, patch: Partial<CartRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="space-y-4">
          {rows.map((row) => {
            const item = itemsById.get(row.itemId)
            const subtotal = (item?.price ?? 0) * row.qty
            return (
              <div key={row.key} className="flex flex-col sm:flex-row gap-3 sm:items-end border-b border-slate-200/70 pb-4 last:border-0 last:pb-0">
                <div className="flex-1">
                  <Select
                    label="Jenis Pekerjaan"
                    options={options}
                    value={row.itemId}
                    onChange={(value) => updateRow(row.key, { itemId: value })}
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Input
                    label="Qty"
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) => updateRow(row.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </div>
                <div className="w-full sm:w-44 text-sm font-semibold text-slate-700 sm:pb-3">
                  {formatRupiah(subtotal)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  aria-label="Hapus baris"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )
          })}

          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Tambah Pekerjaan
          </Button>
        </div>
      </Card>

      <Card padding="lg" variant="panel">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">Total Estimasi</span>
          <span className="text-2xl font-extrabold text-slate-900">{formatRupiah(total)}</span>
        </div>
      </Card>
    </div>
  )
}
