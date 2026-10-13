"use client"

import React, { useMemo, useState } from "react"
import { Plus, Send, Sparkles, Trash2 } from "lucide-react"
import { Alert, Button, Card, Select, Spinner, Textarea } from "@/components/ui"

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
  alasan?: string
}

interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

const MAX_QUESTIONS = 5

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export function HitungHargaPanel({ items }: { items: WorkPriceItemRow[] }) {
  const [description, setDescription] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answer, setAnswer] = useState("")
  const [rows, setRows] = useState<CartRow[]>([])
  const [ringkasan, setRingkasan] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const options = useMemo(
    () => items.map((i) => ({ value: i.id, label: `${i.groupName}${i.level ? ` - ${i.level}` : ""} — ${formatRupiah(i.price)}` })),
    [items]
  )

  const total = rows.reduce((sum, r) => sum + (itemsById.get(r.itemId)?.price ?? 0) * r.qty, 0)
  const questionsAsked = messages.filter((m) => m.role === "assistant").length
  const started = messages.length > 0

  async function sendToAi(history: ChatMessage[]) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/kalkulator-harga/analisa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menganalisa")

      if (body.status === "tanya") {
        setMessages([...history, { role: "assistant", text: body.pertanyaan }])
        return
      }

      // status selesai
      const matched: CartRow[] = (body.items as { itemId: string; qty: number; alasan: string }[])
        .filter((it) => itemsById.has(it.itemId))
        .map((it) => ({ key: crypto.randomUUID(), itemId: it.itemId, qty: Math.max(1, Math.round(it.qty) || 1), alasan: it.alasan }))
      setMessages([...history, { role: "assistant", text: body.ringkasan || "Selesai." }])
      setRows(matched)
      setRingkasan(body.ringkasan ?? null)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menganalisa")
    } finally {
      setLoading(false)
    }
  }

  async function startChat() {
    if (!description.trim()) return
    const history: ChatMessage[] = [{ role: "user", text: description }]
    setMessages(history)
    setRows([])
    setRingkasan(null)
    setDone(false)
    await sendToAi(history)
  }

  async function sendAnswer() {
    if (!answer.trim()) return
    const history: ChatMessage[] = [...messages, { role: "user", text: answer }]
    setMessages(history)
    setAnswer("")
    await sendToAi(history)
  }

  function reset() {
    setDescription("")
    setMessages([])
    setAnswer("")
    setRows([])
    setRingkasan(null)
    setDone(false)
    setError(null)
  }

  function addRow() {
    setRows((prev) => [...prev, { key: crypto.randomUUID(), itemId: items[0]?.id ?? "", qty: 1 }])
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  function updateRow(key: string, patch: Partial<CartRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-6">
      {!started ? (
        <Card padding="lg">
          <div className="space-y-4">
            <Textarea
              label="Tulis Pekerjaan"
              placeholder="Contoh: Client minta bikin master data supplier, lalu laporan penjualan bulanan per sales dengan grafik."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
            <Button onClick={startChat} disabled={loading || !description.trim()}>
              {loading ? <Spinner size="sm" color="white" className="mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Mulai Analisa
            </Button>
            {error && <Alert variant="error">{error}</Alert>}
          </div>
        </Card>
      ) : (
        <Card padding="lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                Obrolan dengan AI {questionsAsked > 0 && `— ${questionsAsked}/${MAX_QUESTIONS} pertanyaan`}
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                Mulai Ulang
              </Button>
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-medium text-slate-700 max-w-xl">{description}</div>
              {messages.slice(1).map((m, i) => (
                <div key={i} className={`rounded-2xl px-4 py-3 text-sm font-medium max-w-xl ${m.role === "assistant" ? "bg-blue-50 text-blue-900 ml-0" : "bg-slate-100/80 text-slate-700 ml-auto"}`}>
                  {m.text}
                </div>
              ))}
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner size="sm" />
                AI sedang menganalisa...
              </div>
            )}

            {!done && !loading && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendAnswer()}
                  placeholder="Jawab pertanyaan AI di sini..."
                  className="flex-1 h-12 rounded-xl border border-slate-200/80 bg-white/60 px-4 text-sm font-medium focus:outline-none focus:border-blue-600"
                  autoFocus
                />
                <Button onClick={sendAnswer} disabled={!answer.trim()}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}

            {error && <Alert variant="error">{error}</Alert>}
          </div>
        </Card>
      )}

      {done && ringkasan && <Alert variant="info">{ringkasan}</Alert>}

      {done && (
        <>
          <Card padding="lg">
            <div className="space-y-4">
              {rows.length === 0 && <p className="text-sm text-slate-500 font-medium">AI tidak menemukan item yang cocok — tambahkan manual kalau perlu.</p>}
              {rows.map((row) => {
                const item = itemsById.get(row.itemId)
                const subtotal = (item?.price ?? 0) * row.qty
                return (
                  <div key={row.key} className="flex flex-col gap-2 border-b border-slate-200/70 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                      <div className="flex-1">
                        <Select label="Jenis Pekerjaan" options={options} value={row.itemId} onChange={(value) => updateRow(row.key, { itemId: value })} />
                      </div>
                      <div className="w-full sm:w-28">
                        <label className="block text-xs font-bold text-slate-600 mb-1">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(e) => updateRow(row.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-full h-12 rounded-xl border border-slate-200/80 bg-white/60 px-3 text-sm font-medium focus:outline-none focus:border-blue-600"
                        />
                      </div>
                      <div className="w-full sm:w-44 text-sm font-semibold text-slate-700 sm:pb-3">{formatRupiah(subtotal)}</div>
                      <Button variant="ghost" size="sm" onClick={() => removeRow(row.key)} aria-label="Hapus baris">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {row.alasan && <p className="text-xs text-slate-500 italic">AI: {row.alasan}</p>}
                  </div>
                )
              })}

              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="w-4 h-4 mr-1" /> Tambah Manual
              </Button>
            </div>
          </Card>

          <Card padding="lg" variant="panel">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-600">Total Estimasi</span>
              <span className="text-2xl font-extrabold text-slate-900">{formatRupiah(total)}</span>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
