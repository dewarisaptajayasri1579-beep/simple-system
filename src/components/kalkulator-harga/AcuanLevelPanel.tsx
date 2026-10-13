"use client"

import React, { useState } from "react"
import { Pencil, Check, X } from "lucide-react"
import { Button, CurrencyInput, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Textarea } from "@/components/ui"

export interface AcuanLevelRow {
  id: string
  groupName: string
  level: string | null
  label: string
  description: string | null
  price: number
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export function AcuanLevelPanel({ items, canEdit }: { items: AcuanLevelRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(items)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftPrice, setDraftPrice] = useState(0)
  const [draftDesc, setDraftDesc] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit(row: AcuanLevelRow) {
    setEditingId(row.id)
    setDraftPrice(row.price)
    setDraftDesc(row.description ?? "")
    setError(null)
  }

  async function saveEdit(id: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/kalkulator-harga/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: draftPrice, description: draftDesc }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan")
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, price: body.price, description: body.description } : r)))
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  const grouped = rows.reduce<Record<string, AcuanLevelRow[]>>((acc, r) => {
    acc[r.groupName] = acc[r.groupName] ?? []
    acc[r.groupName].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-8">
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {Object.entries(grouped).map(([groupName, groupRows]) => (
        <div key={groupName}>
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">{groupName}</h2>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Harga</TableHead>
                  {canEdit && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRows.map((row) => {
                  const isEditing = editingId === row.id
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold whitespace-nowrap">{row.level ?? row.label}</TableCell>
                      <TableCell className="max-w-md">
                        {isEditing ? (
                          <Textarea value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} sizeVariant="sm" />
                        ) : (
                          <span className="text-slate-600">{row.description ?? "-"}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {isEditing ? (
                          <CurrencyInput value={draftPrice} onChange={setDraftPrice} sizeVariant="sm" />
                        ) : (
                          <span className={row.price === 0 ? "text-amber-600 font-semibold" : ""}>{formatRupiah(row.price)}</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <Button size="sm" variant="primary" onClick={() => saveEdit(row.id)} disabled={saving}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => startEdit(row)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      ))}
    </div>
  )
}
