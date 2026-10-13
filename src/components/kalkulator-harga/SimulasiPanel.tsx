"use client"

import React from "react"
import Link from "next/link"
import { ChevronRight, MessageSquareText, Plus } from "lucide-react"
import { Button, Card } from "@/components/ui"

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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs sm:text-sm text-slate-600 font-medium">
          Hasil diskusi dengan AI yang sudah disimpan — klik untuk lihat obrolan &amp; rincian bobotnya.
        </p>
        <Link href="/kalkulator-harga/hitung-harga">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" /> Simulasi Baru
          </Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card padding="lg" variant="feature" className="text-center">
          <span className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center mx-auto mb-3">
            <MessageSquareText className="w-5 h-5" />
          </span>
          <p className="text-sm font-semibold text-slate-700">Belum ada simulasi tersimpan.</p>
          <p className="text-xs text-slate-500 mt-1">
            Klik <strong>Simulasi Baru</strong> untuk mulai diskusi dengan AI — hasilnya bisa disimpan di sini.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/kalkulator-harga/simulasi/${row.id}`}>
                <Card variant="solid" padding="sm" hoverable className="!rounded-2xl flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
                    <MessageSquareText className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{row.title}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                      {row.clientName ? `${row.clientName} · ` : ""}
                      {formatTanggal(row.createdAtIso)}
                      {row.createdByName ? ` · ${row.createdByName}` : ""} · {row.items.length} pekerjaan · {row.totalPoints} poin
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-slate-900 whitespace-nowrap">{formatRupiah(row.totalPrice)}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
