"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { AlertCircle, Check, CheckCheck, Clock, NotebookPen, Paperclip, Pencil, Plus, Send, Sparkles, Trash2, Zap } from "lucide-react"

import { Alert, Badge, Button, SkeletonList } from "@/components/ui"
import { SegmentPicker } from "./SegmentPicker"
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
    segmentId: string | null
    segmentName: string | null
  }
  pic: { id: string; name: string } | null
  canAct: boolean
  hasWhatsappConnection: boolean
  whatsappStatus: string | null
  whatsappConnected: boolean
  whatsappConnectionLabel: string | null
}

interface LeadNote {
  id: string
  body: string
  createdAt: string
  author: { id: string; name: string }
}

interface MessageTemplate {
  id: string
  title: string
  body: string
  createdBy: { id: string; name: string }
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

function noteTimestamp(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export const ConversationView: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const [meta, setMeta] = useState<ConversationMeta | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [attachment, setAttachment] = useState<{ url: string; messageType: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [sending, setSending] = useState(false)
  const [usedSuggestionId, setUsedSuggestionId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<{ id: string; style: string; text: string }[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [takingOver, setTakingOver] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [typing, setTyping] = useState(false)
  const [notes, setNotes] = useState<LeadNote[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState<{ id: string | null; title: string; body: string } | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
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
    if (evt.type === "notification" || evt.type === "group_message" || evt.conversationId !== conversationId) return
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

  // Textarea composer auto-grow mengikuti isi ketikan — biar baris pertama tidak "naik" ke luar
  // tampilan sebelum di-scroll. Dibatasi max-h-32 (lihat className textarea), lewat itu baru
  // scroll internal seperti biasa.
  useEffect(() => {
    const el = draftRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

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

  const leadId = meta?.lead.id ?? null
  const loadNotes = useCallback(async () => {
    if (!leadId) return
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/notes`, { cache: "no-store" })
      const d = await res.json()
      if (res.ok) setNotes(d.notes ?? [])
    } catch {
      /* ignore */
    }
  }, [leadId])
  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const addNote = async () => {
    const text = noteDraft.trim()
    if (!text || !leadId || savingNote) return
    setSavingNote(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Gagal menyimpan catatan")
        return
      }
      setNotes((prev) => [d.note, ...prev])
      setNoteDraft("")
    } catch {
      setError("Gagal menghubungi server saat menyimpan catatan")
    } finally {
      setSavingNote(false)
    }
  }

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing/message-templates", { cache: "no-store" })
      const d = await res.json()
      if (res.ok) setTemplates(d.templates ?? [])
    } catch {
      /* ignore */
    }
  }, [])
  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const useTemplate = (t: MessageTemplate) => {
    setDraft(t.body)
    setTemplatesOpen(false)
  }

  const saveTemplate = async () => {
    if (!templateForm || !templateForm.title.trim() || !templateForm.body.trim() || savingTemplate) return
    setSavingTemplate(true)
    setError(null)
    try {
      const isEdit = Boolean(templateForm.id)
      const res = await fetch(
        isEdit ? `/api/marketing/message-templates/${templateForm.id}` : "/api/marketing/message-templates",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: templateForm.title.trim(), body: templateForm.body.trim() }),
        },
      )
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Gagal menyimpan template")
        return
      }
      setTemplates((prev) => {
        if (isEdit) return prev.map((t) => (t.id === d.template.id ? d.template : t)).sort((a, b) => a.title.localeCompare(b.title))
        return [...prev, d.template].sort((a, b) => a.title.localeCompare(b.title))
      })
      setTemplateForm(null)
    } catch {
      setError("Gagal menghubungi server saat menyimpan template")
    } finally {
      setSavingTemplate(false)
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!window.confirm("Hapus template ini?")) return
    setError(null)
    const res = await fetch(`/api/marketing/message-templates/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const d = await res.json().catch(() => null)
      setError(d?.error || "Gagal menghapus template")
      return
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

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
    const media = attachment
    if ((!text && !media) || sending) return
    setSending(true)
    const tempId = `tmp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      providerMessageId: null,
      direction: "OUTBOUND",
      messageType: media ? media.messageType : "TEXT",
      body: text || null,
      mediaUrl: media?.url ?? null,
      senderUserId: null,
      sentAt: new Date().toISOString(),
      deliveryStatus: "QUEUED",
    }
    setMessages((prev) => [...prev, optimistic])
    setError(null)
    setDraft("")
    setAttachment(null)
    const suggestionId = usedSuggestionId
    setUsedSuggestionId(null)
    try {
      const res = await fetch(`/api/marketing/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: text,
          mediaUrl: media?.url ?? undefined,
          messageType: media?.messageType ?? undefined,
          aiSuggestionId: suggestionId,
        }),
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
            {lead.outcome !== "OPEN" && <Badge variant="secondary" size="sm">{lead.outcome}</Badge>}
            {meta.whatsappConnectionLabel && <Badge variant="secondary" size="sm">{meta.whatsappConnectionLabel}</Badge>}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {lead.companyName ? `${lead.companyName} · ` : ""}
            {lead.whatsappNumber}
            {meta.pic ? ` · PIC: ${meta.pic.name}` : " · belum ada PIC"}
          </p>
          {/* segmen bisa diganti/dibikin baru langsung dari sini — Aturan Baru: Sales boleh nambah
              segmen (lihat POST /api/marketing/segments), jadi tidak perlu pindah ke Detail Lead. */}
          <div className="mt-1.5">
            <SegmentPicker
              value={lead.segmentId ?? ""}
              disabled={!meta.canAct}
              onChange={async (segmentId) => {
                setMeta((prev) => (prev ? { ...prev, lead: { ...prev.lead, segmentId: segmentId || null } } : prev))
                const res = await fetch(`/api/marketing/leads/${lead.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ segmentId: segmentId || null }),
                })
                if (!res.ok) await load()
              }}
            />
          </div>
        </div>
        <Link href={`/marketing/leads/${lead.id}`} className="text-xs font-bold text-blue-700 hover:underline flex-shrink-0 mt-0.5">
          Detail
        </Link>
      </div>

      {/* catatan internal — freeform, dicap waktu+tanggal otomatis. Ditaruh di sini (bukan di
          paling bawah dekat composer) karena ini yang paling sering diisi Sales sambil chat. */}
      <div className="border-b border-slate-200 py-2">
        <button
          onClick={() => setNotesOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600"
        >
          <NotebookPen className="w-3.5 h-3.5" />
          Catatan{notes.length > 0 ? ` (${notes.length})` : ""}
          <span className="text-slate-400 font-medium">{notesOpen ? "— tutup" : "— lihat/tambah"}</span>
        </button>
        {notesOpen && (
          <div className="mt-2 flex flex-col gap-2">
            {meta.canAct && (
              <div className="flex items-end gap-2">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={1}
                  placeholder="Tulis catatan tambahan…"
                  className="flex-1 resize-none max-h-24 px-3 py-2 rounded-xl border border-slate-200 bg-white/70 text-xs outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
                <Button size="sm" onClick={addNote} isLoading={savingNote} disabled={!noteDraft.trim()} className="flex-shrink-0">
                  Simpan
                </Button>
              </div>
            )}
            {notes.length === 0 ? (
              <p className="text-xs text-slate-400">Belum ada catatan.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                {notes.map((n) => (
                  <li key={n.id} className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <p className="whitespace-pre-wrap break-words text-slate-700">{n.body}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{n.author.name} · {noteTimestamp(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
                {m.mediaUrl && m.messageType === "AUDIO" && (
                  <audio controls src={m.mediaUrl} className="w-56 max-w-full mb-1" />
                )}
                {m.mediaUrl && m.messageType !== "IMAGE" && m.messageType !== "AUDIO" && (
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

      {meta.canAct && (
        <div className="pb-2">
          <button
            onClick={() => setTemplatesOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600"
          >
            <Zap className="w-3.5 h-3.5" /> {templatesOpen ? "Sembunyikan Template" : "Template Pesan"}
          </button>
          {templatesOpen && (
            <div className="mt-2 flex flex-col gap-1.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              {templates.length === 0 && !templateForm && (
                <p className="text-xs text-slate-400 px-0.5">Belum ada template.</p>
              )}
              {templates.map((t) => (
                <div key={t.id} className="flex items-start gap-1.5">
                  <button
                    onClick={() => useTemplate(t)}
                    className="flex-1 text-left text-xs p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300"
                  >
                    <span className="font-bold text-slate-700">{t.title}</span>
                    <p className="text-slate-500 mt-0.5 line-clamp-2">{t.body}</p>
                  </button>
                  <button
                    onClick={() => setTemplateForm({ id: t.id, title: t.title, body: t.body })}
                    className="p-1.5 text-slate-400 hover:text-blue-700 flex-shrink-0"
                    title="Edit template"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 flex-shrink-0"
                    title="Hapus template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {templateForm ? (
                <div className="flex flex-col gap-1.5 p-2.5 rounded-xl border border-blue-200 bg-white">
                  <input
                    value={templateForm.title}
                    onChange={(e) => setTemplateForm((f) => (f ? { ...f, title: e.target.value } : f))}
                    placeholder="Judul template (mis. Follow up harga)"
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-500"
                  />
                  <textarea
                    value={templateForm.body}
                    onChange={(e) => setTemplateForm((f) => (f ? { ...f, body: e.target.value } : f))}
                    rows={3}
                    placeholder="Isi pesan…"
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-blue-500 resize-none"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setTemplateForm(null)} className="text-xs font-bold text-slate-500 px-2 py-1">
                      Batal
                    </button>
                    <Button size="sm" onClick={saveTemplate} isLoading={savingTemplate}>
                      Simpan
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setTemplateForm({ id: null, title: "", body: "" })}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 px-0.5 py-1 self-start"
                >
                  <Plus className="w-3.5 h-3.5" /> Template Baru
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {meta.canAct && (uploading || attachment) && (
        <div className="pb-2 text-xs text-slate-500 flex items-center gap-2">
          <span className="truncate">📎 {uploading ? "Mengunggah…" : attachment?.name}</span>
          {!uploading && (
            <button onClick={() => setAttachment(null)} className="text-rose-600 font-bold flex-shrink-0">hapus</button>
          )}
        </div>
      )}
      {meta.canAct ? (
        <div className="flex items-end gap-2 pt-2 border-t border-slate-200">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (!file) return
              setUploading(true)
              setError(null)
              try {
                const form = new FormData()
                form.append("file", file)
                const res = await fetch(`/api/marketing/conversations/${conversationId}/upload`, { method: "POST", body: form })
                const data = await res.json()
                if (!res.ok) {
                  setError(data.error || "Gagal upload file")
                  return
                }
                setAttachment({ url: data.url, messageType: data.messageType, name: file.name })
              } catch {
                setError("Gagal upload file")
              } finally {
                setUploading(false)
              }
            }}
          />
          <button
            type="button"
            title="Lampirkan file"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canSend || uploading}
            className="w-11 h-11 rounded-2xl border border-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
            placeholder={composerPlaceholder}
            disabled={!canSend}
            className="flex-1 resize-none max-h-32 overflow-y-auto px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/70 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <Button
            onClick={send}
            disabled={sending || uploading || (!draft.trim() && !attachment) || !canSend}
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
