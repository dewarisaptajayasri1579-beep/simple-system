"use client"

import React, { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, RotateCcw, Save, Send, Sparkles, Trash2 } from "lucide-react"
import { Alert, Button, Input, Spinner } from "@/components/ui"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

interface HasilItem {
  key: string
  itemId: string
  groupName: string
  level: string | null
  label: string
  qty: number
  unitPrice: number
  alasan: string
}

type AnswerType = "radio" | "checkbox" | "text"

const MAX_QUESTIONS = 5

const STARTER_HINTS = [
  "Client minta tambah master data produk yang ada kategori dan satuannya.",
  "Minta laporan penjualan per sales, bisa difilter bulan dan dibandingkan bulan lalu.",
  "Minta tombol cetak surat jalan dari data pengiriman yang sudah ada.",
]

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

/** Label kategori+level — ini "hasil akhir" yang dicari di menu Blesscom. */
function levelLabel(it: { groupName: string; level: string | null; label: string }): string {
  return it.level ? `${it.groupName} — ${it.level}` : it.label
}

export function PengajuanBlesscomPanel() {
  const router = useRouter()
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)

  const [description, setDescription] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answerType, setAnswerType] = useState<AnswerType>("text")
  const [choices, setChoices] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [answer, setAnswer] = useState("")
  const [items, setItems] = useState<HasilItem[]>([])
  const [ringkasan, setRingkasan] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [maxQuestions, setMaxQuestions] = useState(MAX_QUESTIONS)

  const [clientName, setClientName] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const questionsAsked = messages.filter((m) => m.role === "assistant").length
  const started = messages.length > 0
  const total = items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0)

  // Scroll kontainer timeline-nya sendiri, bukan scrollIntoView() — itu ikut menggeser window.
  useEffect(() => {
    const count = messages.length + items.length + (loading ? 1 : 0)
    if (count !== lastCountRef.current) {
      lastCountRef.current = count
      const el = timelineRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }
  }, [messages, items, loading])

  async function sendToAi(history: ChatMessage[], opts: { conclude?: boolean } = {}) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/blesscom/pengajuan/analisa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, maxQuestions, forceConclude: opts.conclude === true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menganalisa")

      if (body.status === "tanya") {
        setMessages([...history, { role: "assistant", text: body.pertanyaan }])
        setAnswerType((body.tipeJawaban as AnswerType) ?? "text")
        setChoices(body.pilihan ?? [])
        setPicked([])
        setAnswer("")
        return
      }

      setMessages([...history, { role: "assistant", text: body.ringkasan || "Selesai." }])
      setItems(
        (body.items as Omit<HasilItem, "key">[]).map((it) => ({ ...it, key: crypto.randomUUID() }))
      )
      setRingkasan(body.ringkasan ?? null)
      setChoices([])
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menganalisa")
    } finally {
      setLoading(false)
    }
  }

  async function startChat(text?: string) {
    const first = (text ?? description).trim()
    if (!first) return
    setDescription(first)
    const history: ChatMessage[] = [{ role: "user", text: first }]
    setMessages(history)
    setItems([])
    setRingkasan(null)
    setDone(false)
    setSaved(false)
    await sendToAi(history)
  }

  async function submitAnswer(textOverride?: string, opts: { conclude?: boolean } = {}) {
    const text = (textOverride ?? answer).trim()
    if (!text) return
    const history: ChatMessage[] = [...messages, { role: "user", text }]
    setMessages(history)
    setAnswer("")
    setPicked([])
    setChoices([])
    await sendToAi(history, opts)
  }

  function reset() {
    setDescription("")
    setMessages([])
    setAnswer("")
    setChoices([])
    setPicked([])
    setItems([])
    setRingkasan(null)
    setDone(false)
    setError(null)
    setClientName("")
    setSaved(false)
    setMaxQuestions(MAX_QUESTIONS)
    lastCountRef.current = 0
  }

  async function simpan() {
    if (items.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/kalkulator-harga/simulasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "level",
          title: description.slice(0, 160),
          summary: ringkasan,
          clientName: clientName || null,
          transcript: messages,
          items: items.map((it) => ({
            nama: levelLabel(it),
            qty: it.qty,
            // Blesscom tidak pakai bobot — skor & poin sengaja kosong, harga langsung dari level.
            scores: {},
            points: 0,
            unitPrice: it.unitPrice,
            reason: it.alasan,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan")
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-20rem)] lg:h-[calc(100vh-18rem)] min-h-[24rem] glass-panel rounded-3xl border border-white/80 shadow-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200/70 bg-white/60 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">Tentukan Kategori &amp; Level</p>
            <p className="text-[11px] text-slate-500 font-medium">
              {!started ? "Acuan Blesscom: murni kategori & level" : done ? "Selesai" : `${questionsAsked}/${maxQuestions} pertanyaan`}
            </p>
          </div>
        </div>
        {started && (
          <Button variant="ghost" size="sm" onClick={reset} leftIcon={<RotateCcw className="w-4 h-4" />}>
            Mulai Ulang
          </Button>
        )}
      </div>

      <div ref={timelineRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {!started ? (
          <div className="m-auto text-center max-w-md space-y-4">
            <span className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </span>
            <div>
              <p className="text-base font-bold text-slate-800">Pekerjaan apa yang diminta?</p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Untuk Blesscom, hasil akhirnya cuma kategori dan levelnya — tanpa hitung bobot.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {STARTER_HINTS.map((h) => (
                <button
                  key={h}
                  onClick={() => startChat(h)}
                  className="text-left rounded-xl border border-slate-200/80 bg-white/70 hover:bg-blue-50 hover:border-blue-400 px-3 py-2 text-xs font-medium text-slate-600 transition-colors"
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-2xl px-4 py-2.5 text-sm font-medium max-w-[85%] sm:max-w-xl whitespace-pre-wrap ${
                  m.role === "assistant" ? "bg-blue-50 text-blue-900 self-start" : "bg-slate-800 text-white self-end"
                }`}
              >
                {m.text}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium self-start">
                <Spinner size="sm" />
                sedang menganalisa...
              </div>
            )}

            {done && (
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Hasil: Kategori &amp; Level</p>

                {items.length === 0 && <p className="text-sm text-slate-500 font-medium">Belum bisa ditentukan — coba jelaskan lagi lebih spesifik.</p>}

                {items.map((it) => (
                  <div key={it.key} className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-slate-200/70 pb-3 last:border-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{levelLabel(it)}</p>
                      <p className="text-xs text-slate-500 italic mt-0.5">{it.alasan}</p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) => (x.key === it.key ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))
                        )
                      }
                      className="w-20 h-9 rounded-xl border border-slate-200/80 bg-white/60 px-3 text-sm font-medium focus:outline-none focus:border-blue-600"
                      aria-label="Qty"
                    />
                    <span className="w-36 text-sm font-semibold text-slate-700">{formatRupiah(it.unitPrice * it.qty)}</span>
                    <Button variant="ghost" size="sm" onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))} aria-label="Hapus">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-slate-200/70 bg-white/70 backdrop-blur-md px-5 py-3 flex-shrink-0 space-y-2.5">
        {error && <Alert variant="error">{error}</Alert>}

        {!started && (
          <div className="flex gap-2 items-end">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  startChat()
                }
              }}
              rows={2}
              placeholder="Tulis pekerjaan yang diminta client Blesscom..."
              className="flex-1 resize-none max-h-32 overflow-y-auto px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/70 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            <Button onClick={() => startChat()} disabled={loading || !description.trim()}>
              {loading ? <Spinner size="sm" color="white" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        )}

        {started && !done && !loading && choices.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => {
                const active = answerType === "checkbox" && picked.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() =>
                      answerType === "checkbox"
                        ? setPicked((prev) => (active ? prev.filter((p) => p !== c) : [...prev, c]))
                        : submitAnswer(c)
                    }
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs sm:text-sm font-medium transition-colors text-left ${
                      active
                        ? "border-blue-500 bg-blue-50 text-blue-900"
                        : "border-slate-200/80 bg-white/80 text-slate-700 hover:bg-blue-50 hover:border-blue-400"
                    }`}
                  >
                    {answerType === "checkbox" && (
                      <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${active ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                        {active && <Check className="w-3 h-3 text-white" />}
                      </span>
                    )}
                    {c}
                  </button>
                )
              })}
            </div>
            {answerType === "checkbox" && (
              <Button size="sm" onClick={() => submitAnswer(picked.join(", "))} disabled={picked.length === 0}>
                Kirim Pilihan
              </Button>
            )}
          </div>
        )}

        {started && !done && !loading && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                placeholder={choices.length > 0 ? "...atau jelaskan dengan kata-katamu sendiri" : "Ketik jawabanmu..."}
                className="flex-1 h-11 rounded-2xl border border-slate-200 bg-white/70 px-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                autoFocus
              />
              <Button onClick={() => submitAnswer()} disabled={!answer.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {questionsAsked > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => submitAnswer("Langsung tentukan saja kategori & levelnya.", { conclude: true })}>
                  Tentukan Sekarang
                </Button>
                {questionsAsked >= maxQuestions && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Batas {maxQuestions} pertanyaan tercapai.{" "}
                    <button onClick={() => setMaxQuestions((n) => Math.min(15, n + 5))} className="text-blue-700 font-bold hover:underline">
                      Gali lebih dalam
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {done && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1">
              <p className="text-[11px] text-slate-500 font-semibold">{items.length} pekerjaan</p>
              <p className="text-xl font-extrabold text-slate-900 leading-tight">{formatRupiah(total)}</p>
            </div>
            <div className="w-full sm:w-52">
              <Input placeholder="Nama client (opsional)" sizeVariant="sm" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <Button
              onClick={simpan}
              disabled={saving || saved || items.length === 0}
              leftIcon={saving ? <Spinner size="sm" color="white" /> : <Save className="w-4 h-4" />}
            >
              {saved ? "Tersimpan" : "Simpan"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
