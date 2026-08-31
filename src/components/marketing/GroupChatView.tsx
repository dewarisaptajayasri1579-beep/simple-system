"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Paperclip, Pencil, Plus, Send, ShieldCheck, Trash2, Users, X, Zap } from "lucide-react"

import { Alert, Badge, Button, Input, Modal, SkeletonList, Spinner } from "@/components/ui"
import { useMarketingStream, useVisibilityRefresh } from "./ui"

interface GroupMessage {
  id: string
  providerMessageId?: string | null
  direction: string
  messageType: string
  body: string | null
  mediaUrl: string | null
  senderName: string | null
  senderUserId: string | null
  sentAt: string
}

interface GroupMeta {
  id: string
  name: string
  whatsappStatus: string | null
  whatsappConnected: boolean
  whatsappConnectionLabel: string | null
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

export const GroupChatView: React.FC<{ groupId: string }> = ({ groupId }) => {
  const [meta, setMeta] = useState<GroupMeta | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [attachment, setAttachment] = useState<{ url: string; messageType: string; name: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const [savingName, setSavingName] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [participantsInfo, setParticipantsInfo] = useState<{
    subject: string
    description: string | null
    participantCount: number
    participants: { id: string; phoneNumber: string | null; name: string | null; isAdmin: boolean; isSuperAdmin: boolean }[]
  } | null>(null)
  const [loadingParticipants, setLoadingParticipants] = useState(false)
  const [participantsError, setParticipantsError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState<{ id: string | null; title: string; body: string } | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lastCountRef = useRef(0)

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const res = await fetch(`/api/marketing/groups/${groupId}/messages?limit=100`, { cache: "no-store" })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Gagal memuat percakapan")
          return
        }
        setError(null)
        setMeta(data.group)
        setMessages(data.messages)
        setHasMoreOlder(Boolean(data.hasMoreOlder))
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [groupId],
  )

  const loadOlder = async () => {
    if (loadingOlder || messages.length === 0) return
    setLoadingOlder(true)
    try {
      const res = await fetch(`/api/marketing/groups/${groupId}/messages?limit=100&beforeId=${messages[0].id}`, { cache: "no-store" })
      const data = await res.json()
      if (res.ok) {
        setMessages((prev) => [...data.messages, ...prev])
        setHasMoreOlder(Boolean(data.hasMoreOlder))
        lastCountRef.current = messages.length + data.messages.length
      }
    } finally {
      setLoadingOlder(false)
    }
  }

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const t = setInterval(() => load(true), 20000)
    return () => clearInterval(t)
  }, [load])
  useVisibilityRefresh(() => load(true))
  useMarketingStream((evt) => {
    if (evt.type === "group_message" && evt.groupChatId === groupId) load(true)
  })
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

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

  const saveName = async () => {
    if (!nameDraft.trim() || savingName) return
    setSavingName(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft.trim() }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Gagal ganti nama grup")
        return
      }
      setMeta((prev) => (prev ? { ...prev, name: d.group.name } : prev))
      setRenaming(false)
    } finally {
      setSavingName(false)
    }
  }

  const openParticipants = async () => {
    setParticipantsOpen(true)
    setLoadingParticipants(true)
    setParticipantsError(null)
    try {
      const res = await fetch(`/api/marketing/groups/${groupId}/participants`, { cache: "no-store" })
      const d = await res.json()
      if (!res.ok) {
        setParticipantsError(d.error || "Gagal ambil anggota grup")
        return
      }
      setParticipantsInfo(d.info)
    } catch {
      setParticipantsError("Gagal menghubungi server")
    } finally {
      setLoadingParticipants(false)
    }
  }

  const send = async () => {
    const text = draft.trim()
    const media = attachment
    if ((!text && !media) || sending) return
    setSending(true)
    setError(null)
    setDraft("")
    setAttachment(null)
    try {
      const res = await fetch(`/api/marketing/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, mediaUrl: media?.url ?? undefined, messageType: media?.messageType ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal mengirim")
        return
      }
      setMessages((prev) => [...prev, data.message])
    } catch {
      setError("Gagal mengirim")
    } finally {
      setSending(false)
    }
  }

  if (loading) return <SkeletonList rows={6} />
  if (!meta) return <Alert variant="error">{error ?? "Grup tidak ditemukan"}</Alert>

  const canSend = meta.whatsappConnected
  const composerPlaceholder = !meta.whatsappConnected ? "WhatsApp sedang tidak terhubung" : "Ketik balasan…"

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-8rem)]">
      <div className="flex items-start gap-3 pb-3 border-b border-slate-200">
        <div className="flex-1 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-2 max-w-xs">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} sizeVariant="sm" autoFocus />
              <Button size="sm" isLoading={savingName} onClick={saveName}>Simpan</Button>
              <button onClick={() => setRenaming(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button
              onClick={() => {
                setNameDraft(meta.name)
                setRenaming(true)
              }}
              className="inline-flex items-center gap-1.5 group"
            >
              <p className="text-sm font-black text-slate-900">{meta.name}</p>
              <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" />
            </button>
          )}
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            Grup WhatsApp
            {meta.whatsappConnectionLabel && <Badge variant="secondary" size="sm">{meta.whatsappConnectionLabel}</Badge>}
          </p>
        </div>
        <button
          onClick={openParticipants}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-700 flex-shrink-0 mt-0.5"
        >
          <Users className="w-3.5 h-3.5" /> Anggota
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        {hasMoreOlder && (
          <button onClick={loadOlder} disabled={loadingOlder} className="self-center text-xs font-bold text-blue-700 py-1 disabled:opacity-50">
            {loadingOlder ? "Memuat…" : "Muat pesan lama"}
          </button>
        )}
        {messages.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Belum ada pesan.</p>}
        {messages.map((m) => {
          const out = m.direction === "OUTBOUND"
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${out ? "bg-blue-600 text-white rounded-br-md" : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"}`}>
                {!out && m.senderName && <p className="text-[10px] font-bold text-blue-700 mb-0.5">{m.senderName}</p>}
                {m.mediaUrl && m.messageType === "IMAGE" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.mediaUrl} alt="lampiran" className="rounded-lg max-w-full mb-1 max-h-64 object-cover" />
                )}
                {m.mediaUrl && m.messageType === "AUDIO" && <audio controls src={m.mediaUrl} className="w-56 max-w-full mb-1" />}
                {m.mediaUrl && m.messageType !== "IMAGE" && m.messageType !== "AUDIO" && (
                  <a href={m.mediaUrl} target="_blank" rel="noreferrer" className={`underline text-xs ${out ? "text-blue-100" : "text-blue-700"}`}>
                    📎 Lampiran ({m.messageType.toLowerCase()})
                  </a>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <p className={`text-[10px] mt-1 ${out ? "text-blue-100 text-right" : "text-slate-400"}`}>{clockTime(m.sentAt)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {error && <div className="pb-2"><Alert variant="error">{error}</Alert></div>}

      <div className="pb-2">
        <button onClick={() => setTemplatesOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
          <Zap className="w-3.5 h-3.5" /> {templatesOpen ? "Sembunyikan Template" : "Template Pesan"}
        </button>
        {templatesOpen && (
          <div className="mt-2 flex flex-col gap-1.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
            {templates.length === 0 && !templateForm && <p className="text-xs text-slate-400 px-0.5">Belum ada template.</p>}
            {templates.map((t) => (
              <div key={t.id} className="flex items-start gap-1.5">
                <button onClick={() => useTemplate(t)} className="flex-1 text-left text-xs p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300">
                  <span className="font-bold text-slate-700">{t.title}</span>
                  <p className="text-slate-500 mt-0.5 line-clamp-2">{t.body}</p>
                </button>
                <button onClick={() => setTemplateForm({ id: t.id, title: t.title, body: t.body })} className="p-1.5 text-slate-400 hover:text-blue-700 flex-shrink-0" title="Edit template">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteTemplate(t.id)} className="p-1.5 text-slate-400 hover:text-rose-600 flex-shrink-0" title="Hapus template">
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
                  <button onClick={() => setTemplateForm(null)} className="text-xs font-bold text-slate-500 px-2 py-1">Batal</button>
                  <Button size="sm" onClick={saveTemplate} isLoading={savingTemplate}>Simpan</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setTemplateForm({ id: null, title: "", body: "" })} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 px-0.5 py-1 self-start">
                <Plus className="w-3.5 h-3.5" /> Template Baru
              </button>
            )}
          </div>
        )}
      </div>

      {(uploading || attachment) && (
        <div className="pb-2 text-xs text-slate-500 flex items-center gap-2">
          <span className="truncate">📎 {uploading ? "Mengunggah…" : attachment?.name}</span>
          {!uploading && <button onClick={() => setAttachment(null)} className="text-rose-600 font-bold flex-shrink-0">hapus</button>}
        </div>
      )}
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
              const res = await fetch(`/api/marketing/groups/${groupId}/upload`, { method: "POST", body: form })
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

      <Modal isOpen={participantsOpen} onClose={() => setParticipantsOpen(false)} title="Anggota Grup" size="sm">
        {loadingParticipants ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : participantsError ? (
          <Alert variant="error">{participantsError}</Alert>
        ) : participantsInfo ? (
          <div className="space-y-3">
            {participantsInfo.description && <p className="text-xs text-slate-500">{participantsInfo.description}</p>}
            <p className="text-xs font-bold text-slate-500 uppercase">{participantsInfo.participantCount} Anggota</p>
            <ul className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
              {participantsInfo.participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 text-sm">
                  <span className="text-slate-700 truncate">{p.name || p.phoneNumber || p.id.split("@")[0]}</span>
                  {(p.isAdmin || p.isSuperAdmin) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 flex-shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" /> {p.isSuperAdmin ? "Owner" : "Admin"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
