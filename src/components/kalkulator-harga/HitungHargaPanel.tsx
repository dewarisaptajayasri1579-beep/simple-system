"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown, ChevronRight, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react"
import { Alert, Button, Card, Input, Select, Spinner, Textarea } from "@/components/ui"
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

function formatRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

export function HitungHargaPanel() {
  const router = useRouter()
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

  async function startChat() {
    if (!description.trim()) return
    const history: ChatMessage[] = [{ role: "user", text: description }]
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

  return (
    <div className="space-y-6">
      {!started ? (
        <Card padding="lg">
          <div className="space-y-4">
            <Textarea
              label="Pekerjaan apa yang diminta client?"
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
                <div
                  key={i}
                  className={`rounded-2xl px-4 py-3 text-sm font-medium max-w-xl ${m.role === "assistant" ? "bg-blue-50 text-blue-900" : "bg-slate-100/80 text-slate-700 ml-auto"}`}
                >
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

            {!done && !loading && answerType === "radio" && choices.length > 0 && (
              <div className="space-y-2">
                {choices.map((c) => (
                  <button
                    key={c}
                    onClick={() => submitAnswer(c)}
                    className="w-full text-left rounded-xl border border-slate-200/80 bg-white/70 hover:bg-blue-50 hover:border-blue-400 px-4 py-3 text-sm font-medium text-slate-700 transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {!done && !loading && answerType === "checkbox" && choices.length > 0 && (
              <div className="space-y-2">
                {choices.map((c) => {
                  const active = picked.includes(c)
                  return (
                    <button
                      key={c}
                      onClick={() => setPicked((prev) => (active ? prev.filter((p) => p !== c) : [...prev, c]))}
                      className={`w-full flex items-center gap-3 text-left rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                        active ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200/80 bg-white/70 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${active ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                        {active && <Check className="w-3.5 h-3.5 text-white" />}
                      </span>
                      {c}
                    </button>
                  )
                })}
                <Button onClick={() => submitAnswer(picked.join(", "))} disabled={picked.length === 0}>
                  Kirim Jawaban
                </Button>
              </div>
            )}

            {!done && !loading && answerType === "text" && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                  placeholder="Jawab pertanyaan AI di sini..."
                  className="flex-1 h-12 rounded-xl border border-slate-200/80 bg-white/60 px-4 text-sm font-medium focus:outline-none focus:border-blue-600"
                  autoFocus
                />
                <Button onClick={() => submitAnswer()} disabled={!answer.trim()}>
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
              {jobs.length === 0 && <p className="text-sm text-slate-500 font-medium">AI tidak bisa menilai bobotnya — tambahkan manual kalau perlu.</p>}

              {jobs.map((job) => {
                const poin = totalPoints(job.scores)
                const hargaSatuan = priceFromPoints(poin)
                return (
                  <div key={job.key} className="border-b border-slate-200/70 pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                      <button
                        onClick={() => updateJob(job.key, { open: !job.open })}
                        className="flex items-center gap-2 flex-1 text-left"
                        aria-label="Lihat rincian bobot"
                      >
                        {job.open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        <span className="text-sm font-bold text-slate-800">{job.nama}</span>
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">{poin} poin</span>
                      </button>
                      <div className="w-full sm:w-24">
                        <input
                          type="number"
                          min={1}
                          value={job.qty}
                          onChange={(e) => updateJob(job.key, { qty: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-full h-10 rounded-xl border border-slate-200/80 bg-white/60 px-3 text-sm font-medium focus:outline-none focus:border-blue-600"
                          aria-label="Qty"
                        />
                      </div>
                      <div className="w-full sm:w-44 text-sm font-semibold text-slate-700">{formatRupiah(hargaSatuan * job.qty)}</div>
                      <Button variant="ghost" size="sm" onClick={() => setJobs((prev) => prev.filter((j) => j.key !== job.key))} aria-label="Hapus pekerjaan">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {job.alasan && !job.open && <p className="text-xs text-slate-500 italic mt-1 ml-6">AI: {job.alasan}</p>}

                    {job.open && (
                      <div className="mt-3 ml-6 space-y-3">
                        {job.alasan && <p className="text-xs text-slate-500 italic">AI: {job.alasan}</p>}
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

              <Button variant="outline" size="sm" onClick={addJob}>
                <Plus className="w-4 h-4 mr-1" /> Tambah Pekerjaan Manual
              </Button>
            </div>
          </Card>

          <Card padding="lg" variant="panel">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-600">Total Estimasi</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  {totalPoin} poin × {formatRupiah(POINT_VALUE_IDR)}/poin
                </p>
              </div>
              <span className="text-2xl font-extrabold text-slate-900">{formatRupiah(total)}</span>
            </div>
          </Card>

          <Card padding="lg">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1">
                <Input
                  label="Nama client (opsional)"
                  placeholder="Mis. PT Maju Jaya"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <Button onClick={saveSimulation} disabled={saving || saved || jobs.length === 0}>
                {saving ? <Spinner size="sm" color="white" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {saved ? "Tersimpan" : "Simpan Simulasi"}
              </Button>
            </div>
            {saved && (
              <p className="text-xs text-emerald-700 font-semibold mt-3">
                Simulasi tersimpan — bisa dilihat di Acuan Level → tab Simulasi Kalkulator.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
