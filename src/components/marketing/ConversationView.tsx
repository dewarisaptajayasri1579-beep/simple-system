"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Paperclip, Send, Sparkles } from "lucide-react"

import { Alert, Badge, Button, SkeletonList } from "@/components/ui"
import { tempBadgeVariant, useVisibilityRefresh } from "./ui"

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

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

export const ConversationView: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const [meta, setMeta] = useState<ConversationMeta | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [mediaUrl, setMediaUrl] = useState("")
  const [sending, setSending] = useState(false)
  const [usedSuggestionId, setUsedSuggestionId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<{ id: string; style: string; text: string }[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [takingOver, setTakingOver] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
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
        setHasMoreOlder(Boolean(data.hasMoreOlder))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [conversationId],
  )

  const loadOlder = async () => {
    if (loadingOlder || messages.length === 0) return
    setLoadingOlder(true)
    try {
      const res = await fetch(
        `/api/marketing/conversations/${conversationId}/messages?limit=100&beforeId=${messages[0].id}`,
        { cache: "no-store" },
      )
      const data = await res.json()
      if (res.ok) {
        setMessages((prev) => [...data.messages, ...prev])
        setHasMoreOlder(Boolean(data.hasMoreOlder))
        lastCountRef.current = messages.length + data.messages.length // cegah auto-scroll ke bawah
      }
    } finally {
      setLoadingOlder(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const t = setInterval(() => load(true), 6000)
    return () => clearInterval(t)
  }, [load])
  useVisibilityRefresh(() => load(true))
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/ai-suggestions`, { cache: "no-store" })
      const d = await res.json()
      if (res.ok) setSuggestions(d.suggestions ?? [])
    } catch {
      /* ignore */
    }
  }, [conversationId])
  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

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
    const media = mediaUrl.trim()
    if ((!text && !media) || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, mediaUrl: media || undefined, aiSuggestionId: usedSuggestionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal mengirim")
        return
      }
      setError(null)
      setDraft("")
      setMediaUrl("")
      setUsedSuggestionId(null)
      setMessages((prev) => [...prev, data.message])
    } finally {
      setSending(false)
    }
  }

  if (loading) return <SkeletonList rows={6} />
  if (!meta) return <Alert variant="error">{error ?? "Percakapan tidak ditemukan"}</Alert>

  const { lead } = meta

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] lg:h-[calc(100vh-8rem)]">
      {/* header lead */}
      <div className="flex items-start gap-3 pb-3 border-b border-slate-200">
        <Link href="/marketing/inbox" className="mt-0.5 text-slate-400 hover:text-slate-700 lg:hidden">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-black text-slate-900">{lead.displayName}</p>
            <Badge variant={tempBadgeVariant(lead.temperature)} size="sm">{lead.temperature}</Badge>
            {lead.segmentName && <Badge variant="secondary" size="sm">{lead.segmentName}</Badge>}
            {lead.outcome !== "OPEN" && <Badge variant="secondary" size="sm">{lead.outcome}</Badge>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {lead.companyName ? `${lead.companyName} · ` : ""}
            {lead.whatsappNumber}
            {meta.pic ? ` · PIC: ${meta.pic.name}` : " · belum ada PIC"}
          </p>
        </div>
        <Link href={`/marketing/leads/${lead.id}`} className="text-xs font-bold text-blue-700 hover:underline flex-shrink-0 mt-0.5">
          Detail
        </Link>
      </div>

      {/* timeline */}
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        {hasMoreOlder && (
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            className="self-center text-xs font-bold text-blue-700 py-1 disabled:opacity-50"
          >
            {loadingOlder ? "Memuat…" : "Muat pesan lama"}
          </button>
        )}
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
                {m.mediaUrl && m.messageType === "IMAGE" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.mediaUrl} alt="lampiran" className="rounded-lg max-w-full mb-1 max-h-64 object-cover" />
                )}
                {m.mediaUrl && m.messageType !== "IMAGE" && (
                  <a href={m.mediaUrl} target="_blank" rel="noreferrer" className={`underline text-xs ${out ? "text-blue-100" : "text-blue-700"}`}>
                    📎 Lampiran ({m.messageType.toLowerCase()})
                  </a>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
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
      {error && <div className="pb-2"><Alert variant="error">{error}</Alert></div>}

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

      {meta.canAct && mediaUrl && (
        <div className="pb-2 text-xs text-slate-500 flex items-center gap-2">
          <span className="truncate">📎 {mediaUrl}</span>
          <button onClick={() => setMediaUrl("")} className="text-rose-600 font-bold flex-shrink-0">hapus</button>
        </div>
      )}
      {meta.canAct ? (
        <div className="flex items-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            title="Lampirkan gambar via URL"
            onClick={() => {
              const u = window.prompt("URL gambar/dokumen (https://…):")
              if (u && /^https?:\/\//.test(u)) setMediaUrl(u.trim())
            }}
            disabled={!meta.hasWhatsappConnection}
            className="w-11 h-11 rounded-2xl border border-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            <Paperclip className="w-4 h-4" />
          </button>
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
            className="flex-1 resize-none max-h-32 px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/70 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <Button
            onClick={send}
            disabled={sending || !draft.trim() || !meta.hasWhatsappConnection}
            isLoading={sending}
            className="!w-11 !h-11 !p-0 !rounded-2xl flex-shrink-0"
            aria-label="Kirim"
          >
            {!sending && <Send className="w-4 h-4" />}
          </Button>
        </div>
      ) : (
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-slate-500">
            Kamu memantau lead ini{meta.pic ? ` (PIC: ${meta.pic.name})` : ""}. Untuk membalas, ambil alih dulu.
          </p>
          <Button size="sm" onClick={takeOver} isLoading={takingOver} className="flex-shrink-0">
            Ambil Alih
          </Button>
        </div>
      )}
    </div>
  )
}
