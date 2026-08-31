"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, Check, CheckCheck, Clock, Paperclip, Send, Sparkles } from "lucide-react"

import { Alert, Badge, Button, SkeletonList } from "@/components/ui"
import { tempBadgeVariant, useMarketingStream, useVisibilityRefresh } from "./ui"
import { WhatsappStatusBanner } from "./WhatsappStatusBanner"

interface Message {
  id: string
  providerMessageId?: string | null
  direction: string
  messageType: string
  body: string | null
  mediaUrl: string | null
  senderUserId: string | null
  sentAt: string
  deliveryStatus: string
}

/** Tanda status pesan keluar ala WhatsApp: jam (antre) · ✓ (terkirim) · ✓✓ (diterima) ·
 *  ✓✓ biru (dibaca) · ⚠ (gagal). */
const MessageTicks: React.FC<{ status: string }> = ({ status }) => {
  if (status === "FAILED") return <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
  if (status === "QUEUED" || status === "PENDING") return <Clock className="w-3 h-3 text-blue-100" />
  if (status === "READ") return <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
  if (status === "DELIVERED") return <CheckCheck className="w-3.5 h-3.5 text-blue-100" />
  return <Check className="w-3.5 h-3.5 text-blue-100" /> // SENT / lainnya
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
  whatsappStatus: string | null
  whatsappConnected: boolean
  whatsappConnectionLabel: string | null
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
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const lastCountRef = useRef(0)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // Fallback saja — jalur utama update-nya SSE di bawah.
    const t = setInterval(() => load(true), 20000)
    return () => clearInterval(t)
  }, [load])
  useVisibilityRefresh(() => load(true))
  useMarketingStream((evt) => {
    if (evt.type === "notification" || evt.conversationId !== conversationId) return
    if (evt.type === "message") {
      setTyping(false)
      load(true)
    } else if (evt.type === "typing") {
      setTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => setTyping(false), 8000)
    } else if (evt.type === "status") {
      setMessages((prev) =>
        prev.map((m) =>
          m.providerMessageId === evt.providerMessageId ? { ...m, deliveryStatus: evt.status } : m,
        ),
      )
    }
  })
  useEffect(() => () => { if (typingTimerRef.current) clearTimeout(typingTimerRef.current) }, [])
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
    const tempId = `tmp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      providerMessageId: null,
      direction: "OUTBOUND",
      messageType: media ? "IMAGE" : "TEXT",
      body: text || null,
      mediaUrl: media || null,
      senderUserId: null,
      sentAt: new Date().toISOString(),
      deliveryStatus: "QUEUED",
    }
    setMessages((prev) => [...prev, optimistic])
    setError(null)
    setDraft("")
    setMediaUrl("")
    const suggestionId = usedSuggestionId
    setUsedSuggestionId(null)
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, mediaUrl: media || undefined, aiSuggestionId: suggestionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal mengirim")
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, deliveryStatus: "FAILED" } : m)))
        return
      }
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)))
    } catch {
      setError("Gagal mengirim")
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, deliveryStatus: "FAILED" } : m)))
    } finally {
      setSending(false)
    }
  }

  if (loading) return <SkeletonList rows={6} />
  if (!meta) return <Alert variant="error">{error ?? "Percakapan tidak ditemukan"}</Alert>

  const { lead } = meta
  // Bisa kirim hanya kalau percakapan tertaut ke koneksi WA DAN koneksi itu sedang aktif (READY).
  const canSend = meta.hasWhatsappConnection && meta.whatsappConnected
  const composerPlaceholder = !meta.hasWhatsappConnection
    ? "Lead belum tertaut ke koneksi WhatsApp"
    : !meta.whatsappConnected
      ? "WhatsApp sedang tidak terhubung — hubungkan dulu di atas"
      : "Ketik balasan…"

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)]">
      {/* header lead — tombol kembali ada di header shell */}
      <div className="flex items-start gap-3 pb-3 border-b border-slate-200">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-black text-slate-900">{lead.displayName}</p>
            <Badge variant={tempBadgeVariant(lead.temperature)} size="sm">{lead.temperature}</Badge>
            {lead.segmentName && <Badge variant="secondary" size="sm">{lead.segmentName}</Badge>}
            {lead.outcome !== "OPEN" && <Badge variant="secondary" size="sm">{lead.outcome}</Badge>}
            {meta.whatsappConnectionLabel && <Badge variant="secondary" size="sm">{meta.whatsappConnectionLabel}</Badge>}
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
                <p className={`text-[10px] mt-1 flex items-center gap-1 ${out ? "text-blue-100 justify-end" : "text-slate-400"}`}>
                  <span>{clockTime(m.sentAt)}</span>
                  {out && m.deliveryStatus ? <MessageTicks status={m.deliveryStatus} /> : null}
                </p>
              </div>
            </div>
          )
        })}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3.5 py-2.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer / banner */}
      {meta.canAct && <WhatsappStatusBanner className="pb-2" />}
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
            disabled={!canSend}
            className="w-11 h-11 rounded-2xl border border-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
            placeholder={composerPlaceholder}
            disabled={!canSend}
            className="flex-1 resize-none max-h-32 px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/70 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <Button
            onClick={send}
            disabled={sending || !draft.trim() || !canSend}
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
