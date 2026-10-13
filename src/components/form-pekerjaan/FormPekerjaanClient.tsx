"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Check, CheckCircle2, Cloud, Plus, Send, Sparkles, Trash2, X } from "lucide-react"
import { Alert, Button, Card, Input, Spinner } from "@/components/ui"

interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

interface ItemRow {
  id: string
  nama: string
  qty: number
  summary: string | null
}

type AnswerType = "radio" | "checkbox" | "text"

const MAX_QUESTIONS = 5
const DRAFT_KEY = "work-request-draft-id"

export function FormPekerjaanClient() {
  const [requestId, setRequestId] = useState<string | null>(null)
  const [clientName, setClientName] = useState("")
  const [programmerName, setProgrammerName] = useState("")
  const [items, setItems] = useState<ItemRow[]>([])
  const [posted, setPosted] = useState(false)
  const [booting, setBooting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)

  // Panel chat satu pekerjaan
  const [chatOpen, setChatOpen] = useState(false)
  const [description, setDescription] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [answerType, setAnswerType] = useState<AnswerType>("text")
  const [choices, setChoices] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [answer, setAnswer] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatDone, setChatDone] = useState(false)
  const [chatSummary, setChatSummary] = useState<string | null>(null)

  const timelineRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const questionsAsked = messages.filter((m) => m.role === "assistant").length

  // Pulihkan draft dari browser; kalau belum ada / sudah dikirim, buat draft baru.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const saved = typeof window !== "undefined" ? localStorage.getItem(DRAFT_KEY) : null
      if (saved) {
        const res = await fetch(`/api/form/pengajuan/${saved}`)
        if (res.ok) {
          const body = await res.json()
          if (!cancelled && body.status !== "posted") {
            setRequestId(body.id)
            setClientName(body.clientName ?? "")
            setProgrammerName(body.programmerName ?? "")
            setItems(body.items ?? [])
            setBooting(false)
            return
          }
        }
      }
      const res = await fetch("/api/form/pengajuan", { method: "POST" })
      if (!res.ok) {
        if (!cancelled) {
          setError("Sesi form habis — muat ulang halaman dan masukkan password lagi.")
          setBooting(false)
        }
        return
      }
      const body = await res.json()
      if (cancelled) return
      localStorage.setItem(DRAFT_KEY, body.id)
      setRequestId(body.id)
      setBooting(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const autoSave = useCallback(
    (patch: { clientName?: string; programmerName?: string }) => {
      if (!requestId) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        setSaving(true)
        try {
          const res = await fetch(`/api/form/pengajuan/${requestId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
          if (res.ok) setSavedAt(new Date())
        } finally {
          setSaving(false)
        }
      }, 700)
    },
    [requestId]
  )

  useEffect(() => {
    const count = messages.length + (chatLoading ? 1 : 0)
    if (count !== lastCountRef.current) {
      lastCountRef.current = count
      const el = timelineRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }
  }, [messages, chatLoading])

  function openChat() {
    setChatOpen(true)
    setDescription("")
    setMessages([])
    setChoices([])
    setPicked([])
    setAnswer("")
    setChatDone(false)
    setChatSummary(null)
    lastCountRef.current = 0
  }

  async function sendToAi(history: ChatMessage[]) {
    if (!requestId) return
    setChatLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/form/pengajuan/${requestId}/pekerjaan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal memproses")

      if (body.status === "tanya") {
        setMessages([...history, { role: "assistant", text: body.pertanyaan }])
        setAnswerType((body.tipeJawaban as AnswerType) ?? "text")
        setChoices(body.pilihan ?? [])
        setPicked([])
        setAnswer("")
        return
      }

      setMessages([...history, { role: "assistant", text: body.ringkasan || "Pekerjaan sudah dicatat." }])
      setChatSummary(body.ringkasan ?? null)
      setItems((prev) => [...prev, ...(body.items as ItemRow[])])
      setChoices([])
      setChatDone(true)
      setSavedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses")
    } finally {
      setChatLoading(false)
    }
  }

  async function startChat() {
    const first = description.trim()
    if (!first) return
    const history: ChatMessage[] = [{ role: "user", text: first }]
    setMessages(history)
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

  async function hapusItem(itemId: string) {
    if (!requestId) return
    const res = await fetch(`/api/form/pengajuan/${requestId}/pekerjaan/${itemId}`, { method: "DELETE" })
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  async function kirimPosting() {
    if (!requestId) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch(`/api/form/pengajuan/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, programmerName, post: true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal memposting")
      localStorage.removeItem(DRAFT_KEY)
      setPosted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memposting")
    } finally {
      setPosting(false)
    }
  }

  if (booting) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" label="Menyiapkan form..." />
      </div>
    )
  }

  if (posted) {
    return (
      <div className="flex-1 flex items-center justify-center p-5">
        <Card padding="lg" className="w-full max-w-md text-center">
          <span className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </span>
          <h1 className="text-lg font-extrabold text-slate-900">Pengajuan terkirim</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">
            Daftar pekerjaan sudah masuk ke admin. Terima kasih, {programmerName || "rekan"}.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Isi Pengajuan Baru
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full max-w-3xl mx-auto p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Form Pengajuan Pekerjaan</h1>
          <p className="text-xs text-slate-600 font-medium mt-0.5">
            Catat permintaan client. Tiap pekerjaan akan ditanya balik oleh AI maksimal {MAX_QUESTIONS} pertanyaan supaya jelas.
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 whitespace-nowrap mt-1">
          {saving ? <Spinner size="sm" /> : <Cloud className="w-3.5 h-3.5" />}
          {saving ? "Menyimpan..." : savedAt ? "Tersimpan" : "Otomatis tersimpan"}
        </span>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <Card padding="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nama Client"
            placeholder="Mis. PT Maju Jaya"
            value={clientName}
            onChange={(e) => {
              setClientName(e.target.value)
              autoSave({ clientName: e.target.value })
            }}
          />
          <Input
            label="Nama Programmer"
            placeholder="Nama kamu"
            value={programmerName}
            onChange={(e) => {
              setProgrammerName(e.target.value)
              autoSave({ programmerName: e.target.value })
            }}
          />
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Daftar Pekerjaan ({items.length})</h2>
          {!chatOpen && (
            <Button size="sm" onClick={openChat} leftIcon={<Plus className="w-4 h-4" />}>
              Tambah Pekerjaan
            </Button>
          )}
        </div>

        {items.length === 0 && !chatOpen && (
          <Card padding="lg" variant="feature" className="text-center">
            <p className="text-sm font-semibold text-slate-700">Belum ada pekerjaan.</p>
            <p className="text-xs text-slate-500 mt-1">Klik <strong>Tambah Pekerjaan</strong> lalu jelaskan permintaan client-nya.</p>
          </Card>
        )}

        {items.map((item) => (
          <Card key={item.id} padding="md">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{item.nama}</p>
                {item.summary && <p className="text-xs text-slate-500 mt-1">{item.summary}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => hapusItem(item.id)} aria-label="Hapus pekerjaan">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}

        {chatOpen && (
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200/70 bg-white/60">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">Pekerjaan Baru</p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {chatDone ? "Sudah dicatat" : messages.length === 0 ? "Jelaskan permintaan client" : `${questionsAsked}/${MAX_QUESTIONS} pertanyaan`}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setChatOpen(false)} aria-label="Tutup">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div ref={timelineRef} className="max-h-80 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {messages.length === 0 ? (
                <p className="text-xs text-slate-500 font-medium text-center py-4">
                  Tulis pekerjaan yang diminta client — sedetail yang kamu tahu.
                </p>
              ) : (
                messages.map((m, i) => (
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
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium self-start">
                  <Spinner size="sm" />
                  sedang memproses...
                </div>
              )}
            </div>

            <div className="border-t border-slate-200/70 bg-white/70 px-4 py-3 space-y-2.5">
              {chatDone ? (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <p className="text-xs text-emerald-700 font-semibold flex-1">Pekerjaan sudah dicatat &amp; tersimpan.</p>
                  <Button size="sm" variant="outline" onClick={openChat} leftIcon={<Plus className="w-4 h-4" />}>
                    Tambah Lagi
                  </Button>
                  <Button size="sm" onClick={() => setChatOpen(false)}>
                    Selesai
                  </Button>
                </div>
              ) : messages.length === 0 ? (
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
                    placeholder="Contoh: tambah laporan stok per gudang, difilter per bulan."
                    className="flex-1 resize-none max-h-32 overflow-y-auto px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/70 text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    autoFocus
                  />
                  <Button onClick={startChat} disabled={chatLoading || !description.trim()}>
                    {chatLoading ? <Spinner size="sm" color="white" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              ) : chatLoading ? null : answerType === "radio" && choices.length > 0 ? (
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
              ) : answerType === "checkbox" && choices.length > 0 ? (
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
              ) : (
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
            </div>
          </Card>
        )}
      </div>

      {chatSummary && !chatOpen && <Alert variant="success">Pekerjaan terakhir sudah tercatat.</Alert>}

      <Card padding="lg" variant="panel">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-xs text-slate-600 font-medium">
            Pastikan semua pekerjaan sudah masuk sebelum memposting — setelah diposting tidak bisa diubah lagi.
          </p>
          <Button
            onClick={kirimPosting}
            disabled={posting || items.length === 0 || !clientName.trim() || !programmerName.trim()}
            leftIcon={posting ? <Spinner size="sm" color="white" /> : undefined}
          >
            Posting
          </Button>
        </div>
      </Card>
    </div>
  )
}
