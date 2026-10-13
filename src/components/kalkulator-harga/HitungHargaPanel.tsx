"use client"

import React, { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, ChevronRight, Plus, RotateCcw, Save, Send, Sparkles, Trash2 } from "lucide-react"
import { Alert, Button, Input, Select, Spinner } from "@/components/ui"
import { PARAMETER_CODES, POINT_VALUE_IDR, RUBRIC, priceFromPoints, totalPoints, type ParameterCode, type WeightScores } from "@/lib/work-price/rubric"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

interface JobRow {
  key: string
  nama: string
  qty: number
  scores: WeightScores
  alasan?: string
  open: boolean
}

type AnswerType = "radio" | "checkbox" | "text"

const MAX_QUESTIONS = 5

const EMPTY_SCORES: WeightScores = { P1: "none", P2: "none", P3: "none", P4: "none", P5: "none", P6: "none", P7: "display", P8: "reuse" }

const STARTER_HINTS = [
  "Client minta bikin master data supplier, lalu laporan penjualan bulanan per sales.",
  "Tambah fitur cetak surat jalan PDF dari data pengiriman yang sudah ada.",
  "Kirim notifikasi WhatsApp otomatis ke customer tiap ada invoice baru.",
]

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export function HitungHargaPanel() {
  const router = useRouter()
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)

  const [description, setDescription] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answerType, setAnswerType] = useState<AnswerType>("text")
  const [choices, setChoices] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [answer, setAnswer] = useState("")
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [ringkasan, setRingkasan] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [clientName, setClientName] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const questionsAsked = messages.filter((m) => m.role === "assistant").length
  const started = messages.length > 0

  const totalPoin = jobs.reduce((sum, j) => sum + totalPoints(j.scores) * j.qty, 0)
  const total = jobs.reduce((sum, j) => sum + priceFromPoints(totalPoints(j.scores)) * j.qty, 0)

  // Scroll kontainer timeline-nya sendiri, BUKAN scrollIntoView() — scrollIntoView ikut nge-scroll
  // semua ancestor termasuk window, jadi halaman ikut melompat saat balasan baru masuk.
  useEffect(() => {
    const count = messages.length + jobs.length + (loading ? 1 : 0)
    if (count !== lastCountRef.current) {
      lastCountRef.current = count
      const el = timelineRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }
  }, [messages, jobs, loading])

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
        setAnswerType((body.tipeJawaban as AnswerType) ?? "text")
        setChoices(body.pilihan ?? [])
        setPicked([])
        setAnswer("")
        return
      }

      const scored: JobRow[] = (body.pekerjaan as { nama: string; qty: number; scores: WeightScores; alasan: string }[]).map((j) => ({
        key: crypto.randomUUID(),
        nama: j.nama,
        qty: j.qty,
        scores: j.scores,
        alasan: j.alasan,
        open: false,
      }))
      setMessages([...history, { role: "assistant", text: body.ringkasan || "Selesai." }])
      setJobs(scored)
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
    setJobs([])
    setRingkasan(null)
    setDone(false)
    setSaved(false)
    await sendToAi(history)
  }

  async function submitAnswer(textOverride?: string) {
    const text = (textOverride ?? answer).trim()
    if (!text) return
    const history: ChatMessage[] = [...messages, { role: "user", text }]
    setMessages(history)
    setAnswer("")
    setPicked([])
    setChoices([])
    await sendToAi(history)
  }

  function reset() {
    setDescription("")
    setMessages([])
    setAnswer("")
    setChoices([])
    setPicked([])
    setJobs([])
    setRingkasan(null)
    setDone(false)
    setError(null)
    setClientName("")
    setSaved(false)
    lastCountRef.current = 0
  }

  function updateJob(key: string, patch: Partial<JobRow>) {
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...patch } : j)))
  }

  function updateScore(key: string, code: ParameterCode, optionCode: string) {
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, scores: { ...j.scores, [code]: optionCode } } : j)))
  }

  function addJob() {
    setJobs((prev) => [...prev, { key: crypto.randomUUID(), nama: "Pekerjaan baru", qty: 1, scores: { ...EMPTY_SCORES }, open: true }])
  }

  async function saveSimulation() {
    if (jobs.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/kalkulator-harga/simulasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: description.slice(0, 160),
          summary: ringkasan,
          clientName: clientName || null,
          transcript: messages,
          items: jobs.map((j) => {
            const points = totalPoints(j.scores)
            return { nama: j.nama, qty: j.qty, scores: j.scores, points, unitPrice: priceFromPoints(points), reason: j.alasan ?? null }
          }),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan simulasi")
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan simulasi")
    } finally {
      setSaving(false)
    }
  }

  // Tinggi dipatok ke viewport supaya HALAMAN tidak ikut scroll — yang scroll cuma timeline di
  // dalam. Angka mobile lebih besar karena AppLayout menyisakan pb-28 untuk BottomBar.
  return (
    <div className="flex flex-col h-[calc(100vh-20rem)] lg:h-[calc(100vh-18rem)] min-h-[24rem] glass-panel rounded-3xl border border-white/80 shadow-md overflow-hidden">
      {/* Header percakapan */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200/70 bg-white/60 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">Asisten Hitung Harga</p>
            <p className="text-[11px] text-slate-500 font-medium">
              {!started ? "Siap menerima deskripsi pekerjaan" : done ? "Analisa selesai" : `${questionsAsked}/${MAX_QUESTIONS} pertanyaan`}
            </p>
          </div>
        </div>
        {started && (
          <Button variant="ghost" size="sm" onClick={reset} leftIcon={<RotateCcw className="w-4 h-4" />}>
            Mulai Ulang
          </Button>
        )}
      </div>

      {/* Timeline percakapan */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {!started ? (
          <div className="m-auto text-center max-w-md space-y-4">
            <span className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-700 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </span>
            <div>
              <p className="text-base font-bold text-slate-800">Pekerjaan apa yang diminta client?</p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Tulis sebisanya — nanti aku tanya balik yang masih kurang jelas, maksimal {MAX_QUESTIONS} pertanyaan.
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

            {/* Hasil penilaian bobot — muncul di dalam alur obrolan, bisa dikoreksi staf */}
            {done && (
              <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rincian Bobot &amp; Harga</p>

                {jobs.length === 0 && <p className="text-sm text-slate-500 font-medium">Belum ada pekerjaan — tambahkan manual kalau perlu.</p>}

                {jobs.map((job) => {
                  const poin = totalPoints(job.scores)
                  const hargaSatuan = priceFromPoints(poin)
                  return (
                    <div key={job.key} className="border-b border-slate-200/70 pb-3 last:border-0 last:pb-0">
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <button onClick={() => updateJob(job.key, { open: !job.open })} className="flex items-center gap-2 flex-1 text-left min-w-0" aria-label="Lihat rincian bobot">
                          {job.open ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                          <span className="text-sm font-bold text-slate-800 truncate">{job.nama}</span>
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5 flex-shrink-0">{poin} poin</span>
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={job.qty}
                          onChange={(e) => updateJob(job.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-20 h-9 rounded-xl border border-slate-200/80 bg-white/60 px-3 text-sm font-medium focus:outline-none focus:border-blue-600"
                          aria-label="Qty"
                        />
                        <span className="w-36 text-sm font-semibold text-slate-700">{formatRupiah(hargaSatuan * job.qty)}</span>
                        <Button variant="ghost" size="sm" onClick={() => setJobs((prev) => prev.filter((j) => j.key !== job.key))} aria-label="Hapus pekerjaan">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {job.alasan && !job.open && <p className="text-xs text-slate-500 italic mt-1 ml-6">{job.alasan}</p>}

                      {job.open && (
                        <div className="mt-3 ml-6 space-y-3">
                          {job.alasan && <p className="text-xs text-slate-500 italic">{job.alasan}</p>}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {PARAMETER_CODES.map((code) => (
                              <Select
                                key={code}
                                label={`${code}. ${RUBRIC[code].name}`}
                                sizeVariant="sm"
                                searchable={false}
                                options={RUBRIC[code].options.map((o) => ({ value: o.code, label: `${o.label} (${o.points})` }))}
                                value={job.scores[code]}
                                onChange={(value) => updateScore(job.key, code, value)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <Button variant="outline" size="sm" onClick={addJob} leftIcon={<Plus className="w-4 h-4" />}>
                  Tambah Pekerjaan Manual
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer / pilihan jawaban / panel simpan */}
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
              placeholder="Tulis pekerjaan yang diminta client..."
              className="flex-1 resize-none max-h-32 overflow-y-auto px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/70 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            />
            <Button onClick={() => startChat()} disabled={loading || !description.trim()}>
              {loading ? <Spinner size="sm" color="white" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        )}

        {started && !done && !loading && answerType === "radio" && choices.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => submitAnswer(c)}
                className="rounded-full border border-slate-200/80 bg-white/80 hover:bg-blue-50 hover:border-blue-400 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 transition-colors text-left"
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {started && !done && !loading && answerType === "checkbox" && choices.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => {
                const active = picked.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() => setPicked((prev) => (active ? prev.filter((p) => p !== c) : [...prev, c]))}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${
                      active ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200/80 bg-white/80 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${active ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                      {active && <Check className="w-3 h-3 text-white" />}
                    </span>
                    {c}
                  </button>
                )
              })}
            </div>
            <Button size="sm" onClick={() => submitAnswer(picked.join(", "))} disabled={picked.length === 0}>
              Kirim Jawaban
            </Button>
          </div>
        )}

        {started && !done && !loading && answerType === "text" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
              placeholder="Ketik jawabanmu..."
              className="flex-1 h-11 rounded-2xl border border-slate-200 bg-white/70 px-4 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              autoFocus
            />
            <Button onClick={() => submitAnswer()} disabled={!answer.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}

        {done && (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="flex-1">
              <p className="text-[11px] text-slate-500 font-semibold">
                {totalPoin} poin × {formatRupiah(POINT_VALUE_IDR)}
              </p>
              <p className="text-xl font-extrabold text-slate-900 leading-tight">{formatRupiah(total)}</p>
            </div>
            <div className="w-full sm:w-52">
              <Input placeholder="Nama client (opsional)" sizeVariant="sm" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <Button
              onClick={saveSimulation}
              disabled={saving || saved || jobs.length === 0}
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
