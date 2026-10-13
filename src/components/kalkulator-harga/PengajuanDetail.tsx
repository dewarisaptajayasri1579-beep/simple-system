"use client"

import React, { useState } from "react"
import { ChevronDown, ChevronRight, MessageSquareText } from "lucide-react"
import { Card } from "@/components/ui"
import { PARAMETER_CODES, POINT_VALUE_IDR, RUBRIC, labelForOption } from "@/lib/work-price/rubric"

interface ItemRow {
  id: string
  nama: string
  qty: number
  summary: string | null
  reason: string | null
  points: number
  unitPrice: number
  scores: Record<string, string>
  transcript: { role: string; text: string }[]
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export function PengajuanDetail({ totalPoints, totalPrice, items }: { totalPoints: number; totalPrice: number; items: ItemRow[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null)

  return (
    <div className="space-y-4">
      <Card padding="lg" variant="panel">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-slate-600">Total Harga</span>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalPoints} poin × {formatRupiah(POINT_VALUE_IDR)} · {items.length} pekerjaan
            </p>
          </div>
          <span className="text-2xl font-extrabold text-slate-900">{formatRupiah(totalPrice)}</span>
        </div>
      </Card>

      {items.map((item) => {
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
              <div className="mt-4 ml-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-3">
                  {item.summary && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Pemahaman AI</p>
                      <p className="text-xs text-slate-600">{item.summary}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Rincian Bobot</p>
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
                  {item.reason && <p className="text-xs text-slate-500 italic">{item.reason}</p>}
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <MessageSquareText className="w-3.5 h-3.5" /> Obrolan dengan Programmer
                  </p>
                  <div className="max-h-72 overflow-y-auto flex flex-col gap-2 pr-1">
                    {item.transcript.length === 0 ? (
                      <p className="text-xs text-slate-500">Transkrip tidak tersimpan.</p>
                    ) : (
                      item.transcript.map((m, i) => (
                        <div
                          key={i}
                          className={`rounded-2xl px-3 py-2 text-xs font-medium max-w-[90%] whitespace-pre-wrap ${
                            m.role === "assistant" ? "bg-blue-50 text-blue-900 self-start" : "bg-slate-800 text-white self-end"
                          }`}
                        >
                          {m.text}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
