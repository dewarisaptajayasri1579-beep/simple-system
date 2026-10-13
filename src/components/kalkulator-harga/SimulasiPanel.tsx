"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import { Alert, Button, Card } from "@/components/ui"
import { PARAMETER_CODES, RUBRIC, labelForOption, type ParameterCode } from "@/lib/work-price/rubric"

export interface SimulasiItemRow {
  id: string
  nama: string
  qty: number
  points: number
  unitPrice: number
  reason: string | null
  scores: Record<string, string>
}

export interface SimulasiRow {
  id: string
  title: string
  summary: string | null
  clientName: string | null
  totalPoints: number
  totalPrice: number
  createdAtIso: string
  createdByName: string | null
  items: SimulasiItemRow[]
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export function SimulasiPanel({ rows }: { rows: SimulasiRow[] }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function hapus(id: string) {
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/kalkulator-harga/simulasi/${id}`, { method: "DELETE" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menghapus")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs sm:text-sm text-slate-600 font-medium">
          Hasil diskusi dengan AI yang sudah disimpan — rincian pekerjaan, bobot, dan harganya.
        </p>
        <Link href="/kalkulator-harga/hitung-harga">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" /> Simulasi Baru
          </Button>
        </Link>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {rows.length === 0 ? (
        <Card padding="lg" variant="feature">
          <p className="text-sm font-semibold text-slate-700">Belum ada simulasi tersimpan.</p>
          <p className="text-xs text-slate-500 mt-1">
            Klik <strong>Simulasi Baru</strong> untuk mulai diskusi dengan AI — hasilnya bisa disimpan di sini.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const open = openId === row.id
            return (
              <Card key={row.id} padding="md">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <button onClick={() => setOpenId(open ? null : row.id)} className="flex items-start gap-2 flex-1 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />}
                    <div>
                      <p className="text-sm font-bold text-slate-800">{row.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {row.clientName ? `${row.clientName} · ` : ""}
                        {formatTanggal(row.createdAtIso)}
                        {row.createdByName ? ` · ${row.createdByName}` : ""} · {row.items.length} pekerjaan · {row.totalPoints} poin
                      </p>
                    </div>
                  </button>
                  <div className="text-base font-extrabold text-slate-900 whitespace-nowrap">{formatRupiah(row.totalPrice)}</div>
                  <Button variant="ghost" size="sm" onClick={() => hapus(row.id)} disabled={deletingId === row.id} aria-label="Hapus simulasi">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {open && (
                  <div className="mt-4 ml-6 space-y-4">
                    {row.summary && <p className="text-xs text-slate-600 italic">{row.summary}</p>}
                    {row.items.map((item) => (
                      <div key={item.id} className="border-t border-slate-200/70 pt-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-800">
                            {item.nama} {item.qty > 1 && <span className="text-slate-500">× {item.qty}</span>}
                          </span>
                          <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                            {item.points} poin · {formatRupiah(item.unitPrice * item.qty)}
                          </span>
                        </div>
                        {item.reason && <p className="text-xs text-slate-500 italic mt-1">{item.reason}</p>}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                          {PARAMETER_CODES.map((code) => (
                            <div key={code} className="flex justify-between gap-2 text-xs">
                              <span className="text-slate-500">{code}. {RUBRIC[code].name}</span>
                              <span className="text-slate-700 font-medium text-right">{labelForOption(code as ParameterCode, item.scores[code] ?? "")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
