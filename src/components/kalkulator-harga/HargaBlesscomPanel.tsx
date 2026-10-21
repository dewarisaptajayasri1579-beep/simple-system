"use client"

import React, { useState } from "react"
import { Check, Pencil, X } from "lucide-react"
import { Alert, Button, Card, CurrencyInput, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "@/components/ui"

export interface HargaBlesscomRow {
  id: string
  groupName: string
  level: string | null
  label: string
  description: string | null
  blesscomPrice: number
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export function HargaBlesscomPanel({ rows: initial, canEdit }: { rows: HargaBlesscomRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function simpan(id: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/kalkulator-harga/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blesscomPrice: draft }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan")
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, blesscomPrice: body.blesscomPrice } : r)))
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  const grouped = rows.reduce<Record<string, HargaBlesscomRow[]>>((acc, r) => {
    acc[r.groupName] = acc[r.groupName] ?? []
    acc[r.groupName].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <Card padding="md" variant="feature">
        <p className="text-sm font-semibold text-slate-700">Daftar harga khusus client Blesscom</p>
        <p className="text-xs text-slate-500 mt-1">
          Acuannya <strong>murni kategori &amp; level</strong>, bukan bobot — dan angkanya sudah jadi kesepakatan dengan
          client, jadi tidak ikut berubah saat rubrik bobot dikalibrasi ulang. Daftar inilah yang dipakai menu{" "}
          <strong>Blesscom → Daftar Pekerjaan</strong> &amp; <strong>Pengajuan Pekerjaan</strong>. Menambah,
          mengubah, atau mengeluarkan level dari daftar ini dilakukan di{" "}
          <strong>Blesscom → Kategori &amp; Level Pekerjaan</strong>; di sini cuma penyesuaian harganya.
        </p>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {Object.entries(grouped).map(([groupName, groupRows]) => (
        <div key={groupName}>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">{groupName}</h3>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead>Harga Blesscom</TableHead>
                  {canEdit && <TableHead>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRows.map((row) => {
                  const isEditing = editingId === row.id
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-semibold whitespace-nowrap">{row.level ?? row.label}</TableCell>
                      <TableCell className="max-w-md text-slate-600">{row.description ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {isEditing ? (
                          <CurrencyInput value={draft} onChange={setDraft} sizeVariant="sm" />
                        ) : row.blesscomPrice === 0 ? (
                          <span className="text-amber-600 font-semibold">Belum ada harga</span>
                        ) : (
                          <span className="font-semibold">{formatRupiah(row.blesscomPrice)}</span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => simpan(row.id)} disabled={saving}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(row.id)
                                setDraft(row.blesscomPrice)
                                setError(null)
                              }}
                            >
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
