"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronDown, ChevronRight, Trash2 } from "lucide-react"
import { Alert, Button, Card } from "@/components/ui"
import { PARAMETER_CODES, POINT_VALUE_IDR, RUBRIC, labelForOption } from "@/lib/work-price/rubric"
import type { SimulasiRow } from "@/components/kalkulator-harga/SimulasiPanel"

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}

export function SimulasiDetail({ row, transcript, canDelete }: { row: SimulasiRow; transcript: { role: string; text: string }[]; canDelete: boolean }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(row.items[0]?.id ?? null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function hapus() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/kalkulator-harga/simulasi/${row.id}`, { method: "DELETE" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menghapus")
      router.push("/kalkulator-harga/acuan-level")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus")
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/kalkulator-harga/acuan-level">
            <Button variant="ghost" size="sm" aria-label="Kembali">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">{row.title}</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {row.clientName ? `${row.clientName} · ` : ""}
              {formatTanggal(row.createdAtIso)}
              {row.createdByName ? ` · ${row.createdByName}` : ""}
            </p>
          </div>
        </div>
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={hapus} disabled={deleting} aria-label="Hapus simulasi">
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Dua kolom sejajar yang masing-masing scroll sendiri — halaman induknya tidak ikut
          memanjang walau pekerjaannya banyak. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:h-[calc(100vh-18rem)] lg:min-h-[22rem]">
        {/* Transkrip obrolan */}
        <div className="flex flex-col h-[calc(100vh-24rem)] min-h-[20rem] lg:h-full glass-panel rounded-3xl border border-white/80 shadow-md overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200/70 bg-white/60 flex-shrink-0">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Obrolan dengan AI</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
            {transcript.length === 0 ? (
              <p className="text-sm text-slate-500 font-medium m-auto">Transkrip tidak tersimpan.</p>
            ) : (
              transcript.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-medium max-w-[85%] whitespace-pre-wrap ${
                    m.role === "assistant" ? "bg-blue-50 text-blue-900 self-start" : "bg-slate-800 text-white self-end"
                  }`}
                >
                  {m.text}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rincian pekerjaan & bobot */}
        <div className="space-y-3 lg:overflow-y-auto lg:pr-1">
          <Card padding="md" variant="panel">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-600">Total</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  {row.totalPoints} poin × {formatRupiah(POINT_VALUE_IDR)} · {row.items.length} pekerjaan
                </p>
              </div>
              <span className="text-2xl font-extrabold text-slate-900">{formatRupiah(row.totalPrice)}</span>
            </div>
          </Card>

          {row.summary && <Alert variant="info">{row.summary}</Alert>}

          {row.items.map((item) => {
            const open = openId === item.id
            return (
              <Card key={item.id} padding="md">
                <button onClick={() => setOpenId(open ? null : item.id)} className="w-full flex items-center gap-2 text-left">
                  {open ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  <span className="text-sm font-bold text-slate-800 flex-1 min-w-0 truncate">
                    {item.nama} {item.qty > 1 && <span className="text-slate-500 font-medium">× {item.qty}</span>}
                  </span>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 flex-shrink-0">{item.points} poin</span>
                  <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{formatRupiah(item.unitPrice * item.qty)}</span>
                </button>

                {open && (
                  <div className="mt-3 ml-6 space-y-2">
                    {item.reason && <p className="text-xs text-slate-500 italic">{item.reason}</p>}
                    <div className="space-y-1">
                      {PARAMETER_CODES.map((code) => (
                        <div key={code} className="flex justify-between gap-3 text-xs border-b border-slate-100 pb-1 last:border-0">
                          <span className="text-slate-500">
                            {code}. {RUBRIC[code].name}
                          </span>
                          <span className="text-slate-700 font-medium text-right">{labelForOption(code, item.scores[code] ?? "")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
