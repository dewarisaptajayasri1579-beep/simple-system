"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Send, Sparkles } from "lucide-react"

interface Message {
  id: string
  direction: string
  messageType: string
  body: string | null
  mediaUrl: string | null
  senderUserId: string | null
  sentAt: string
  deliveryStatus: string
}

interface ConversationMeta {
  id: string
  lead: {
    id: string
    displayName: string
    companyName: string | null
    contactName: string | null
    whatsappNumber: string
    temperature: string
    priorityLevel: string
    outcome: string
    currentActivityStage: string
    segmentName: string | null
  }
  pic: { id: string; name: string } | null
  canAct: boolean
  hasWhatsappConnection: boolean
}

const TEMP_BADGE: Record<string, string> = {
  HOT: "bg-rose-100 text-rose-700",
  WARM: "bg-amber-100 text-amber-700",
  COLD: "bg-slate-100 text-slate-600",
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

export const ConversationView: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const [meta, setMeta] = useState<ConversationMeta | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [usedSuggestionId, setUsedSuggestionId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<{ id: string; style: string; text: string }[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const res = await fetch(`/api/marketing/conversations/${conversationId}/messages?limit=100`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Gagal memuat percakapan")
          return
        }
        setError(null)
        setMeta(data.conversation)
        setMessages(data.messages)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [conversationId],
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(() => load(true), 10000)
    return () => clearInterval(t)
  }, [load])

  // auto-scroll saat jumlah pesan bertambah
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const [takingOver, setTakingOver] = useState(false)
  const takeOver = async () => {
    if (!meta) return
    setTakingOver(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/leads/${meta.lead.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "takeover", reason: "Ambil alih dari inbox" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal mengambil alih")
        return
      }
      await load()
    } finally {
      setTakingOver(false)
    }
  }

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/ai-suggestions`, { cache: "no-store" })
      const d = await res.json()
      if (res.ok) setSuggestions(d.suggestions ?? [])
    } catch {
      /* ignore */
    }
  }, [conversationId])

  const genSuggestions = async () => {
    setAiBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/ai-suggestions`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Gagal membuat saran")
        return
      }
      setSuggestions(d.suggestions ?? [])
      setShowAi(true)
    } finally {
      setAiBusy(false)
    }
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, aiSuggestionId: usedSuggestionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal mengirim")
        return
      }
      setError(null)
      setDraft("")
      setUsedSuggestionId(null)
      setMessages((prev) => [...prev, data.message])
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  if (loading) return <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>
  if (!meta) return <p className="text-sm font-semibold text-rose-600 py-10 text-center">{error ?? "Percakapan tidak ditemukan"}</p>

  const { lead } = meta

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] lg:h-[calc(100vh-8rem)]">
      {/* header lead */}
      <div className="flex items-start gap-3 pb-3 border-b border-slate-200">
        <Link href="/marketing/inbox" className="mt-0.5 text-slate-400 hover:text-slate-700 lg:hidden">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-slate-900">{lead.displayName}</p>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TEMP_BADGE[lead.temperature] ?? "bg-slate-100 text-slate-600"}`}>
              {lead.temperature}
            </span>
            {lead.segmentName && (
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{lead.segmentName}</span>
            )}
            {lead.outcome !== "OPEN" && (
              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{lead.outcome}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {lead.companyName ? `${lead.companyName} · ` : ""}
            {lead.whatsappNumber}
            {meta.pic ? ` · PIC: ${meta.pic.name}` : " · belum ada PIC"}
          </p>
        </div>
        <Link
          href={`/marketing/leads/${lead.id}`}
          className="text-xs font-bold text-blue-700 hover:underline flex-shrink-0 mt-0.5"
        >
          Detail
        </Link>
      </div>

      {/* timeline */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        {messages.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Belum ada pesan.</p>}
        {messages.map((m) => {
          const out = m.direction === "OUTBOUND"
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                  out ? "bg-blue-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-1 ${out ? "text-blue-100" : "text-slate-400"}`}>
                  {clockTime(m.sentAt)}
                  {out && m.deliveryStatus ? ` · ${m.deliveryStatus.toLowerCase()}` : ""}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* composer / banner */}
      {error && <p className="text-xs font-semibold text-rose-600 pb-2">{error}</p>}

      {meta.canAct && (
        <div className="pb-2">
          <button
            onClick={() => (showAi ? setShowAi(false) : suggestions.length ? setShowAi(true) : genSuggestions())}
            disabled={aiBusy}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" /> {aiBusy ? "Membuat saran…" : showAi ? "Sembunyikan Saran AI" : "Saran AI"}
          </button>
          {showAi && suggestions.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Perkiraan AI — edit sebelum kirim</span>
                <button onClick={genSuggestions} disabled={aiBusy} className="text-[11px] font-bold text-blue-700">
                  Buat ulang
                </button>
              </div>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setDraft(s.text)
                    setUsedSuggestionId(s.id)
                    setShowAi(false)
                  }}
                  className="text-left text-xs p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300"
                >
                  <span className="font-bold text-slate-400 mr-1">
                    {s.style === "PROFESSIONAL" ? "Profesional" : s.style === "CASUAL" ? "Santai" : "Closing"}:
                  </span>
                  <span className="text-slate-700">{s.text}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {meta.canAct ? (
        <div className="flex items-end gap-2 pt-2 border-t border-slate-200">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder={meta.hasWhatsappConnection ? "Ketik balasan…" : "Lead belum terhubung ke koneksi WhatsApp"}
            disabled={!meta.hasWhatsappConnection}
            className="flex-1 resize-none max-h-32 px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim() || !meta.hasWhatsappConnection}
            className="w-11 h-11 rounded-2xl bg-blue-700 text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-500">
            Kamu memantau lead ini{meta.pic ? ` (PIC: ${meta.pic.name})` : ""}. Untuk membalas, ambil alih dulu.
          </p>
          <button
            onClick={takeOver}
            disabled={takingOver}
            className="px-3 py-1.5 rounded-xl bg-blue-700 text-white text-xs font-bold flex-shrink-0 disabled:opacity-50"
          >
            {takingOver ? "…" : "Ambil Alih"}
          </button>
        </div>
      )}
    </div>
  )
}
