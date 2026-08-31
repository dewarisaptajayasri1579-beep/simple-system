"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MessageSquare, Mic, Square } from "lucide-react"

import { Alert, Badge, Button, Card, Input, Select, SkeletonList, Textarea } from "@/components/ui"
import { CompleteFollowUpForm } from "./CompleteFollowUpForm"
import { SegmentPicker } from "./SegmentPicker"
import { tempBadgeVariant } from "./ui"

interface Opt {
  id: string
  name: string
}

interface ActivityTypeOpt {
  id: string
  code: string
  name: string
  stageRank: number
}

interface LeadDetail {
  id: string
  displayName: string
  companyName: string | null
  contactName: string | null
  whatsappNumber: string
  email: string | null
  city: string | null
  temperature: string
  outcome: string
  currentActivityStage: string
  priorityScore: number
  priorityLevel: string
  segment: Opt | null
  source: Opt | null
  lostReason: Opt | null
  buyingPowerTier: Opt | null
  buyingPowerNote: string | null
  buyingPowerSource: string
  dealValue: number | null
  wonNote: string | null
  firstContactAt: string | null
  lastInteractionAt: string | null
  createdAt: string
  assignments: {
    id: string
    assignmentType: string
    isActive: boolean
    reason: string | null
    startedAt: string
    endedAt: string | null
    assignedUser: Opt
    assignedByUser: Opt | null
  }[]
  conversations: { id: string; channel: string; lastMessageAt: string | null; unreadCustomerCount: number; whatsappConnectionLabel: string | null }[]
  activities: {
    id: string
    type: { code: string; name: string }
    actorUser: Opt
    occurredAt: string
    note: string | null
    result: string | null
    isVoid: boolean
    attachmentUrl: string | null
  }[]
  followUps: {
    id: string
    scheduledAt: string
    purpose: string
    note: string | null
    status: string
    resultType: { code: string; name: string } | null
    completedAt: string | null
    assignedUser: Opt
  }[]
  temperatureHistory: {
    id: string
    fromTemperature: string | null
    toTemperature: string
    source: string
    reason: string | null
    changedByUser: Opt | null
    createdAt: string
  }[]
  latestPriority: { score: number; level: string; reasonJson: unknown; calculatedAt: string } | null
}

const AUDIT_LABEL: Record<string, string> = {
  "marketing.lead.update": "Ubah data lead",
  "marketing.lead.temperature": "Ubah temperatur",
  "marketing.lead.outcome": "Ubah outcome",
  "marketing.activity.create": "Tambah aktivitas",
  "marketing.followup.create": "Buat follow up",
  "marketing.followup.complete": "Selesaikan follow up",
  "marketing.followup.cancel": "Batalkan follow up",
  "marketing.assignment.takeover": "Ambil alih PIC",
  "marketing.assignment.reassign": "Reassign PIC",
  "marketing.message.send": "Kirim pesan",
}

const TEMPS = ["COLD", "WARM", "HOT"] as const
function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}
const TEMP_BTN: Record<string, string> = {
  HOT: "bg-rose-600 text-white border-rose-600",
  WARM: "bg-amber-500 text-white border-amber-500",
  COLD: "bg-slate-500 text-white border-slate-500",
}

function toLocalDatetimeInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmt(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export const LeadDetailClient: React.FC<{ leadId: string }> = ({ leadId }) => {
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [pic, setPic] = useState<Opt | null>(null)
  const [canAct, setCanAct] = useState(false)
  const [viewerRole, setViewerRole] = useState<"MANAGER" | "SPV" | "SALES">("SALES")
  const [isCurrentPic, setIsCurrentPic] = useState(false)
  const [auditTrail, setAuditTrail] = useState<{ id: string; action: string; actor: string; at: string }[]>([])
  const [tempSuggestion, setTempSuggestion] = useState<
    { score?: number; suggestedLevel?: string; reasons?: string[]; lockedUntil?: string | null } | null
  >(null)
  const [buyingPowerSuggestion, setBuyingPowerSuggestion] = useState<
    { suggestedTierId?: string; suggestedTierName?: string; score?: number; reason?: string } | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [buyingPowerTiers, setBuyingPowerTiers] = useState<Opt[]>([])
  const [lostReasons, setLostReasons] = useState<Opt[]>([])
  const [activityTypes, setActivityTypes] = useState<ActivityTypeOpt[]>([])
  const [resultTypes, setResultTypes] = useState<Opt[]>([])
  const [users, setUsers] = useState<Opt[]>([])
  const [lostPick, setLostPick] = useState("")
  const [wonOpen, setWonOpen] = useState(false)
  const [wonForm, setWonForm] = useState({ at: "", value: "", note: "" })

  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignTo, setReassignTo] = useState("")
  const [reassignReason, setReassignReason] = useState("")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ai, setAi] = useState<Record<string, any>>({})
  const [aiBusy, setAiBusy] = useState(false)

  const [actOpen, setActOpen] = useState(false)
  const [actForm, setActForm] = useState({ activityTypeId: "", occurredAt: "", note: "" })
  // Rekam Panggilan — mic browser (MediaRecorder) lalu upload+transkrip lewat
  // POST .../recordings, hasilnya cuma pre-fill actForm.note (staf tetap review sebelum
  // "Simpan Aktivitas", lihat handleSaveActivity). pendingAttachmentUrl dikirim bareng saat itu.
  const [recordingStatus, setRecordingStatus] = useState<"idle" | "recording" | "uploading">("idle")
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [pendingAttachmentUrl, setPendingAttachmentUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Visualisasi level suara mic saat rekam — AnalyserNode kebaca langsung via rAF loop & digambar
  // ke canvas (bukan lewat React state, biar tidak re-render tiap frame).
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const waveformRafRef = useRef<number | null>(null)
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const stopWaveform = () => {
    if (waveformRafRef.current != null) cancelAnimationFrame(waveformRafRef.current)
    waveformRafRef.current = null
    analyserRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }

  const drawWaveform = () => {
    const analyser = analyserRef.current
    const canvas = waveformCanvasRef.current
    if (!analyser || !canvas) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)
    const ctx = canvas.getContext("2d")
    if (ctx) {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const barCount = data.length
      const barWidth = w / barCount
      ctx.fillStyle = "#e11d48"
      for (let i = 0; i < barCount; i++) {
        const level = data[i] / 255
        const barHeight = Math.max(2, level * h)
        ctx.fillRect(i * barWidth, (h - barHeight) / 2, Math.max(1, barWidth - 1), barHeight)
      }
    }
    waveformRafRef.current = requestAnimationFrame(drawWaveform)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop()
      stopWaveform()
    }
  }, [])
  const [fuOpen, setFuOpen] = useState(false)
  const [fuForm, setFuForm] = useState({ scheduledAt: "", purpose: "", note: "" })
  const [completingFu, setCompletingFu] = useState<string | null>(null)

  const [form, setForm] = useState({ displayName: "", companyName: "", contactName: "", email: "", city: "", segmentId: "", buyingPowerNote: "", note: "" })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memuat lead")
        return
      }
      setError(null)
      setLead(data.lead)
      setPic(data.pic)
      setCanAct(data.canAct)
      setViewerRole(data.viewerRole ?? "SALES")
      setIsCurrentPic(Boolean(data.isCurrentPic))
      setAuditTrail(data.auditTrail ?? [])
      setTempSuggestion(data.temperatureSuggestion ?? null)
      setBuyingPowerSuggestion(data.buyingPowerSuggestion ?? null)
      setForm({
        displayName: data.lead.displayName ?? "",
        companyName: data.lead.companyName ?? "",
        contactName: data.lead.contactName ?? "",
        email: data.lead.email ?? "",
        city: data.lead.city ?? "",
        segmentId: data.lead.segment?.id ?? "",
        buyingPowerNote: data.lead.buyingPowerNote ?? "",
        note: data.lead.note ?? "",
      })
    } finally {
      setLoading(false)
    }
  }, [leadId])

  const loadAi = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/ai`, { cache: "no-store" })
      const d = await res.json()
      if (res.ok) setAi(d.analyses ?? {})
    } catch {
      /* ignore */
    }
  }, [leadId])

  const runAi = async () => {
    setAiBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/ai`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Analisa AI gagal")
        return
      }
      await Promise.all([loadAi(), load()])
    } finally {
      setAiBusy(false)
    }
  }

  useEffect(() => {
    load()
    loadAi()
  }, [load, loadAi])

  // Catatan Manual — sama persis dengan panel "Catatan" di Inbox (ConversationView.tsx), pakai
  // model+API LeadNote yang sama, jadi satu riwayat yang sama muncul di kedua tempat.
  const [leadNotes, setLeadNotes] = useState<{ id: string; body: string; createdAt: string; author: Opt }[]>([])
  const [noteDraft, setNoteDraft] = useState("")
  const [savingNote, setSavingNote] = useState(false)

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/notes`, { cache: "no-store" })
      const d = await res.json()
      if (res.ok) setLeadNotes(d.notes ?? [])
    } catch {
      /* ignore */
    }
  }, [leadId])
  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const addNote = async () => {
    const text = noteDraft.trim()
    if (!text || savingNote) return
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
      setLeadNotes((prev) => [d.note, ...prev])
      setNoteDraft("")
    } catch {
      setError("Gagal menghubungi server saat menyimpan catatan")
    } finally {
      setSavingNote(false)
    }
  }

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.buyingPowerTiers) setBuyingPowerTiers(d.buyingPowerTiers)
        if (d.lostReasons) setLostReasons(d.lostReasons)
        if (d.activityTypes) setActivityTypes(d.activityTypes)
        if (d.followUpResultTypes) setResultTypes(d.followUpResultTypes)
        if (d.users) setUsers(d.users)
      })
      .catch(() => {})
  }, [])

  const call = async (url: string, body: unknown, method = "POST") => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan")
        return false
      }
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  const startRecording = async () => {
    setRecordingError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : ""
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        // Matiin semua track mic — kalau tidak, indikator "mic aktif" browser tetap nyala terus.
        stream.getTracks().forEach((t) => t.stop())
        stopWaveform()
        void uploadRecording(new Blob(chunksRef.current, { type: recorder.mimeType }))
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
      setRecordingStatus("recording")

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      waveformRafRef.current = requestAnimationFrame(drawWaveform)
    } catch {
      setRecordingError("Tidak bisa akses mic — cek izin browser.")
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setRecordingStatus("uploading")
    mediaRecorderRef.current?.stop()
  }

  const uploadRecording = async (blob: Blob) => {
    try {
      const body = new FormData()
      body.append("audio", blob, "recording.webm")
      // Sengaja fetch langsung (bukan helper `call()`) — ini harus multipart, biarkan browser
      // yang set Content-Type boundary-nya sendiri.
      const res = await fetch(`/api/marketing/leads/${leadId}/recordings`, { method: "POST", body })
      const data = await res.json()
      if (!res.ok) {
        setRecordingError(data.error || "Gagal upload rekaman")
        return
      }

      const now = new Date()
      const callType = activityTypes.find((t) => t.code === "CALL")
      if (data.transcript && callType) {
        // Transkrip sukses & jenis "Telepon" ada → langsung catat aktivitas tanpa perlu staf
        // review dulu (jenis = Telepon, tanggal/jam = sekarang, catatan = transkrip).
        const ok = await call(`/api/marketing/leads/${leadId}/activities`, {
          activityTypeId: callType.id,
          occurredAt: now.toISOString(),
          note: data.transcript,
          attachmentUrl: data.attachmentUrl || undefined,
        })
        if (!ok) setRecordingError("Rekaman & transkrip tersimpan, tapi gagal mencatat aktivitas — isi manual lewat \"+ Tambah\".")
        return
      }

      // Transkrip gagal, atau jenis "Telepon" belum ada di Master Data — buka form buat staf
      // review manual, tetap prefill jenis/tanggal/jam/catatan semaksimal mungkin.
      setPendingAttachmentUrl(data.attachmentUrl ?? null)
      setActForm((f) => ({
        activityTypeId: callType?.id ?? f.activityTypeId,
        occurredAt: toLocalDatetimeInput(now),
        note: data.transcript || f.note,
      }))
      setActOpen(true)
      if (!data.transcript) setRecordingError(data.transcribeError || "Rekaman tersimpan, tapi transkrip gagal — isi catatan manual.")
    } catch {
      setRecordingError("Gagal menghubungi server saat upload rekaman.")
    } finally {
      setRecordingStatus("idle")
    }
  }

  if (loading) return <SkeletonList rows={6} />
  if (!lead) return <Alert variant="error">{error ?? "Lead tidak ditemukan"}</Alert>

  // reasonJson bisa berbentuk lama (array) atau baru ({ reasons, modifiers })
  const rj = lead.latestPriority?.reasonJson
  const priorityReasons: string[] = Array.isArray(rj)
    ? (rj as string[])
    : rj && typeof rj === "object" && Array.isArray((rj as Record<string, unknown>).reasons)
      ? ((rj as Record<string, unknown>).reasons as string[])
      : []
  const priorityModifiers: string[] =
    rj && typeof rj === "object" && Array.isArray((rj as Record<string, unknown>).modifiers)
      ? ((rj as Record<string, unknown>).modifiers as string[])
      : []

  const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
    <Card variant="feature" padding="md">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</h2>
        {right}
      </div>
      {children}
    </Card>
  )

  return (
    <div className="flex flex-col gap-3 max-w-6xl">
      <Link href="/marketing/leads" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Semua Lead
      </Link>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Header */}
      <Card variant="feature" padding="md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-lg font-black text-slate-900">{lead.displayName}</h1>
              <Badge variant={tempBadgeVariant(lead.temperature)} size="sm">{lead.temperature}</Badge>
              {lead.segment && <Badge variant="secondary" size="sm">{lead.segment.name}</Badge>}
              {lead.outcome !== "OPEN" && <Badge variant="secondary" size="sm">{lead.outcome}</Badge>}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {lead.companyName ? `${lead.companyName} · ` : ""}
              {lead.whatsappNumber}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              PIC: {pic?.name ?? "belum ada"} · dibuat {fmt(lead.createdAt)}
              {lead.conversations[0]?.whatsappConnectionLabel && ` · masuk lewat ${lead.conversations[0].whatsappConnectionLabel}`}
            </p>
          </div>
          {lead.conversations[0] && (
            <Link href={`/marketing/inbox/${lead.conversations[0].id}`} className="flex-shrink-0">
              <Button size="sm" leftIcon={<MessageSquare className="w-3.5 h-3.5" />}>Chat</Button>
            </Link>
          )}
        </div>
        {!canAct && (
          <div className="mt-3 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
            <span>Kamu memantau lead ini. Hanya PIC / SPV / Manager yang bisa mengubah.</span>
            <Button
              size="sm"
              isLoading={busy}
              onClick={() => call(`/api/marketing/leads/${leadId}/assignments`, { action: "takeover", reason: "Ambil alih dari detail lead" })}
              className="flex-shrink-0"
            >
              Ambil Alih
            </Button>
          </div>
        )}

        {canAct && (viewerRole !== "SALES" || isCurrentPic) && (
          <div className="mt-3">
            <button onClick={() => setReassignOpen((v) => !v)} className="text-xs font-bold text-blue-700">
              {reassignOpen ? "Tutup reassign" : "Reassign PIC"}
            </button>
            {reassignOpen && (
              <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
                <Select
                  options={[
                    { value: "", label: "Pindah ke…" },
                    ...users.filter((u) => u.id !== pic?.id).map((u) => ({ value: u.id, label: u.name })),
                  ]}
                  value={reassignTo}
                  onChange={setReassignTo}
                  sizeVariant="sm"
                />
                <Input
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Alasan reassign (wajib)"
                  sizeVariant="sm"
                />
                <Button
                  size="sm"
                  isLoading={busy}
                  disabled={!reassignTo || !reassignReason.trim()}
                  onClick={async () => {
                    const ok = await call(`/api/marketing/leads/${leadId}/assignments`, {
                      action: "reassign",
                      assignedUserId: reassignTo,
                      reason: reassignReason.trim(),
                    })
                    if (ok) {
                      setReassignOpen(false)
                      setReassignTo("")
                      setReassignReason("")
                    }
                  }}
                  className="self-start"
                >
                  Pindahkan PIC
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Urutan section kolom kiri sengaja diurut dari yang paling sering diupdate Sales:
          Temperatur, Identitas, Aktivitas, Follow Up, Outcome, Riwayat2, baru AI Insight. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
      <div className="lg:col-span-8 flex flex-col gap-3">

      {/* Temperatur */}
      <Section title="Temperatur">
        <div className="flex gap-2">
          {TEMPS.map((t) => (
            <button
              key={t}
              disabled={!canAct || busy}
              onClick={() => call(`/api/marketing/leads/${leadId}/temperature`, { temperature: t })}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                lead.temperature === t ? TEMP_BTN[t] : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tempSuggestion?.suggestedLevel && tempSuggestion.suggestedLevel !== lead.temperature && (
          <div className="mt-2 text-xs bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-slate-600">
              Saran: <span className="font-bold text-blue-700">{tempSuggestion.suggestedLevel}</span>
              {typeof tempSuggestion.score === "number" ? ` (${tempSuggestion.score})` : ""}
              {tempSuggestion.reasons?.length ? ` — ${tempSuggestion.reasons.join(", ")}` : ""}
            </span>
            {tempSuggestion.lockedUntil ? (
              <span className="text-[10px] text-slate-400 flex-shrink-0">
                lock manual s/d {fmt(tempSuggestion.lockedUntil)}
              </span>
            ) : canAct ? (
              <Button
                size="sm"
                variant="secondary"
                isLoading={busy}
                onClick={() => call(`/api/marketing/leads/${leadId}/temperature`, { temperature: tempSuggestion.suggestedLevel, reason: "Terapkan saran sistem" })}
                className="flex-shrink-0"
              >
                Terapkan
              </Button>
            ) : null}
          </div>
        )}
      </Section>

      {/* Identitas */}
      <Section
        title="Identitas & Segmen"
        right={
          canAct ? (
            <Button
              size="sm"
              isLoading={busy}
              onClick={() =>
                call(
                  `/api/marketing/leads/${leadId}`,
                  {
                    displayName: form.displayName,
                    companyName: form.companyName,
                    contactName: form.contactName,
                    email: form.email,
                    city: form.city,
                    segmentId: form.segmentId,
                    buyingPowerNote: form.buyingPowerNote,
                    note: form.note,
                  },
                  "PATCH",
                )
              }
            >
              Simpan
            </Button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(
            [
              ["displayName", "Nama"],
              ["companyName", "Perusahaan"],
              ["contactName", "Nama Kontak"],
              ["email", "Email"],
              ["city", "Kota"],
            ] as const
          ).map(([key, label]) => (
            <Input
              key={key}
              label={label}
              value={form[key]}
              disabled={!canAct}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              sizeVariant="sm"
            />
          ))}
          {/* Otomatis dari nomor WhatsApp lead ini — read-only (bukan input bebas) karena nomor
             ini yang jadi kunci percakapan WA-nya; ubah lewat modul WhatsApp kalau memang salah. */}
          <Input label="No. Telp" value={lead.whatsappNumber} disabled sizeVariant="sm" />
          <div className="sm:col-span-2">
            <label className="text-xs sm:text-sm font-bold text-slate-700">Segmen</label>
            <div className="mt-1.5">
              <SegmentPicker
                value={form.segmentId}
                disabled={!canAct}
                onChange={async (id) => {
                  setForm((f) => ({ ...f, segmentId: id }))
                  await call(`/api/marketing/leads/${leadId}`, { segmentId: id || null }, "PATCH")
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Klik untuk langsung ganti, atau "+ Baru" buat bikin segmen baru — tersimpan otomatis.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs sm:text-sm font-bold text-slate-700">Kemampuan Beli</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[{ id: "", name: "— belum —" }, ...buyingPowerTiers].map((t) => {
                const active = (lead.buyingPowerTier?.id || "") === t.id
                return (
                  <button
                    key={t.id || "none"}
                    type="button"
                    disabled={!canAct || busy || active}
                    onClick={() => call(`/api/marketing/leads/${leadId}`, { buyingPowerTierId: t.id || null }, "PATCH")}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
                    }`}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
            {buyingPowerSuggestion?.suggestedTierId && (
              <div className="mt-2 text-xs bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-slate-600">
                  Saran AI: <span className="font-bold text-emerald-700">{buyingPowerSuggestion.suggestedTierName}</span>
                  {buyingPowerSuggestion.reason ? ` — ${buyingPowerSuggestion.reason}` : ""}
                </span>
                {canAct && (
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={busy}
                    onClick={() =>
                      call(
                        `/api/marketing/leads/${leadId}`,
                        { buyingPowerTierId: buyingPowerSuggestion.suggestedTierId, buyingPowerSource: "AI" },
                        "PATCH",
                      )
                    }
                    className="flex-shrink-0"
                  >
                    Terapkan
                  </Button>
                )}
              </div>
            )}
            <Input
              className="mt-1.5"
              placeholder="Catatan kemampuan beli (opsional) — mis. punya 3 cabang, instansi ada DIPA"
              value={form.buyingPowerNote}
              disabled={!canAct}
              onChange={(e) => setForm((f) => ({ ...f, buyingPowerNote: e.target.value }))}
              sizeVariant="sm"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Sumbu terpisah dari Segmen &amp; Temperatur. Ikut jadi modifier Priority Score{lead.buyingPowerSource === "AI" ? " · terisi dari saran AI" : ""}.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs sm:text-sm font-bold text-slate-700">Catatan</label>
            <Textarea
              className="mt-1.5"
              value={form.note}
              disabled={!canAct}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              placeholder="Catatan singkat soal lead ini — tampil juga di daftar lead"
              sizeVariant="sm"
            />
          </div>
        </div>
      </Section>

      {/* Aktivitas */}
      <Section
        title={`Aktivitas (${lead.activities.length})`}
        right={
          canAct ? (
            <div className="flex items-center gap-3">
              {recordingStatus === "idle" && (
                <button onClick={startRecording} className="flex items-center gap-1 text-xs font-bold text-rose-600" title="Rekam panggilan lalu transkrip otomatis">
                  <Mic className="w-3.5 h-3.5" /> Rekam Panggilan
                </button>
              )}
              {recordingStatus === "recording" && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse flex-shrink-0" />
                  <canvas ref={waveformCanvasRef} width={64} height={20} className="flex-shrink-0" />
                  <button onClick={stopRecording} className="flex items-center gap-1 text-xs font-bold text-rose-600">
                    <Square className="w-3.5 h-3.5" /> Selesai ({Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")})
                  </button>
                </div>
              )}
              {recordingStatus === "uploading" && <span className="text-xs font-bold text-slate-400">Mengirim & mentranskrip…</span>}
              <button onClick={() => setActOpen((v) => !v)} className="text-xs font-bold text-blue-700">
                {actOpen ? "Tutup" : "+ Tambah"}
              </button>
            </div>
          ) : null
        }
      >
        {recordingError && (
          <Alert variant="error" onClose={() => setRecordingError(null)} className="mb-3">
            {recordingError}
          </Alert>
        )}
        {canAct && activityTypes.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {activityTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                title={`Catat "${t.name}" sekarang`}
                onClick={() => call(`/api/marketing/leads/${leadId}/activities`, { activityTypeId: t.id })}
                className="px-2.5 py-1 rounded-full text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 transition-colors disabled:opacity-50"
              >
                + {t.name}
              </button>
            ))}
          </div>
        )}
        {actOpen && canAct && (
          <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2.5">
            <Select
              options={[{ value: "", label: "Jenis aktivitas…" }, ...activityTypes.map((t) => ({ value: t.id, label: t.name }))]}
              value={actForm.activityTypeId}
              onChange={(v) => setActForm((f) => ({ ...f, activityTypeId: v }))}
              sizeVariant="sm"
            />
            <Input
              type="datetime-local"
              value={actForm.occurredAt}
              onChange={(e) => setActForm((f) => ({ ...f, occurredAt: e.target.value }))}
              sizeVariant="sm"
            />
            <Textarea
              value={actForm.note}
              onChange={(e) => setActForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              placeholder="Catatan (opsional) — otomatis keisi transkrip kalau habis Rekam Panggilan"
              sizeVariant="sm"
            />
            {pendingAttachmentUrl && (
              <audio controls src={pendingAttachmentUrl} className="w-full h-9" />
            )}
            <Button
              size="sm"
              isLoading={busy}
              disabled={!actForm.activityTypeId}
              className="self-start"
              onClick={async () => {
                const ok = await call(`/api/marketing/leads/${leadId}/activities`, {
                  activityTypeId: actForm.activityTypeId,
                  occurredAt: actForm.occurredAt ? new Date(actForm.occurredAt).toISOString() : undefined,
                  note: actForm.note.trim() || undefined,
                  attachmentUrl: pendingAttachmentUrl || undefined,
                })
                if (ok) {
                  setActForm({ activityTypeId: "", occurredAt: "", note: "" })
                  setPendingAttachmentUrl(null)
                  setActOpen(false)
                }
              }}
            >
              Simpan Aktivitas
            </Button>
          </div>
        )}
        {lead.activities.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada aktivitas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lead.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="font-bold text-slate-700">{a.type.name}</span>
                <span className="text-slate-400"> · {fmt(a.occurredAt)} · {a.actorUser.name}</span>
                {a.note && <p className="text-xs text-slate-500 mt-0.5">{a.note}</p>}
                {a.attachmentUrl && <audio controls src={a.attachmentUrl} className="mt-1 h-8 w-full max-w-xs" />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Follow Up */}
      <Section
        title={`Follow Up (${lead.followUps.length})`}
        right={
          canAct ? (
            <button onClick={() => setFuOpen((v) => !v)} className="text-xs font-bold text-blue-700">
              {fuOpen ? "Tutup" : "+ Tambah"}
            </button>
          ) : null
        }
      >
        {fuOpen && canAct && (
          <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2.5">
            <Input
              type="datetime-local"
              value={fuForm.scheduledAt}
              onChange={(e) => setFuForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              sizeVariant="sm"
            />
            <Input
              value={fuForm.purpose}
              onChange={(e) => setFuForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="Tujuan follow up"
              sizeVariant="sm"
            />
            <Textarea
              value={fuForm.note}
              onChange={(e) => setFuForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              placeholder="Catatan (opsional)"
              sizeVariant="sm"
            />
            <Button
              size="sm"
              isLoading={busy}
              disabled={!fuForm.scheduledAt || !fuForm.purpose.trim()}
              className="self-start"
              onClick={async () => {
                const ok = await call(`/api/marketing/leads/${leadId}/follow-ups`, {
                  scheduledAt: new Date(fuForm.scheduledAt).toISOString(),
                  purpose: fuForm.purpose.trim(),
                  note: fuForm.note.trim() || undefined,
                })
                if (ok) {
                  setFuForm({ scheduledAt: "", purpose: "", note: "" })
                  setFuOpen(false)
                }
              }}
            >
              Simpan Follow Up
            </Button>
          </div>
        )}
        {lead.followUps.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada follow up.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lead.followUps.map((f) => (
              <li key={f.id} className="text-sm">
                <span className="font-bold text-slate-700">{f.purpose}</span>
                <span className="text-slate-400"> · {fmt(f.scheduledAt)} · {f.assignedUser.name}</span>
                <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${f.status === "OPEN" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                  {f.status}
                </span>
                {f.resultType && <span className="text-xs text-slate-500"> → {f.resultType.name}</span>}
                {f.status === "OPEN" && canAct && (
                  <button
                    onClick={() => setCompletingFu(completingFu === f.id ? null : f.id)}
                    className="ml-2 text-[11px] font-bold text-blue-700"
                  >
                    Selesaikan
                  </button>
                )}
                {completingFu === f.id && (
                  <CompleteFollowUpForm
                    followUpId={f.id}
                    resultTypes={resultTypes}
                    onDone={() => {
                      setCompletingFu(null)
                      load()
                    }}
                    onCancel={() => setCompletingFu(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Outcome */}
      <Section title="Outcome">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={lead.outcome === "WON" ? "success" : lead.outcome === "LOST" ? "danger" : "secondary"}>
            {lead.outcome}
          </Badge>
          {lead.outcome === "WON" && lead.dealValue != null && (
            <span className="text-xs text-slate-500">Nilai: {rupiah(lead.dealValue)}</span>
          )}
          {lead.outcome === "LOST" && lead.lostReason && (
            <span className="text-xs text-slate-500">Alasan: {lead.lostReason.name}</span>
          )}
        </div>

        {canAct && lead.outcome === "OPEN" && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <Button size="sm" variant="success" onClick={() => setWonOpen((v) => !v)}>
                Tandai WON
              </Button>
            </div>
            {wonOpen && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2.5">
                <Input
                  type="date"
                  label="Tanggal deal"
                  value={wonForm.at}
                  onChange={(e) => setWonForm((f) => ({ ...f, at: e.target.value }))}
                  sizeVariant="sm"
                />
                <Input
                  type="number"
                  label="Nilai deal (Rp, opsional)"
                  value={wonForm.value}
                  onChange={(e) => setWonForm((f) => ({ ...f, value: e.target.value }))}
                  sizeVariant="sm"
                />
                <Textarea
                  label="Catatan"
                  value={wonForm.note}
                  onChange={(e) => setWonForm((f) => ({ ...f, note: e.target.value }))}
                  rows={2}
                  sizeVariant="sm"
                />
                <Button
                  size="sm"
                  variant="success"
                  isLoading={busy}
                  className="self-start"
                  onClick={async () => {
                    const ok = await call(`/api/marketing/leads/${leadId}/outcome`, {
                      outcome: "WON",
                      wonAt: wonForm.at ? new Date(wonForm.at).toISOString() : undefined,
                      dealValue: wonForm.value ? Number(wonForm.value) : undefined,
                      wonNote: wonForm.note.trim() || undefined,
                    })
                    if (ok) setWonOpen(false)
                  }}
                >
                  Simpan WON
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1">
                <Select
                  options={[{ value: "", label: "Alasan LOST…" }, ...lostReasons.map((r) => ({ value: r.id, label: r.name }))]}
                  value={lostPick}
                  onChange={setLostPick}
                  sizeVariant="sm"
                />
              </div>
              <Button
                size="sm"
                variant="danger"
                isLoading={busy}
                disabled={!lostPick}
                onClick={() => call(`/api/marketing/leads/${leadId}/outcome`, { outcome: "LOST", lostReasonId: lostPick })}
              >
                Set LOST
              </Button>
            </div>
          </div>
        )}

        {canAct && lead.outcome !== "OPEN" && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="secondary"
              isLoading={busy}
              onClick={() => call(`/api/marketing/leads/${leadId}/outcome`, { outcome: "OPEN" })}
            >
              Buka Kembali
            </Button>
          </div>
        )}
      </Section>

      {/* Riwayat */}
      <Section title="Riwayat Penugasan">
        <ul className="flex flex-col gap-1.5 text-sm">
          {lead.assignments.map((a) => (
            <li key={a.id} className="text-slate-600">
              <span className="font-bold text-slate-700">{a.assignedUser.name}</span> · {a.assignmentType}
              {a.isActive && <span className="text-emerald-600 font-bold"> (aktif)</span>} · {fmt(a.startedAt)}
              {a.assignedByUser && <span className="text-slate-400"> oleh {a.assignedByUser.name}</span>}
            </li>
          ))}
        </ul>
      </Section>

      {lead.temperatureHistory.length > 0 && (
        <Section title="Riwayat Temperatur">
          <ul className="flex flex-col gap-1.5 text-sm text-slate-600">
            {lead.temperatureHistory.map((h) => (
              <li key={h.id}>
                {h.fromTemperature ?? "—"} → <span className="font-bold text-slate-700">{h.toTemperature}</span> · {h.source} ·{" "}
                {fmt(h.createdAt)}
                {h.changedByUser && <span className="text-slate-400"> · {h.changedByUser.name}</span>}
                {h.reason && <span className="text-slate-400"> · {h.reason}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {auditTrail.length > 0 && (
        <Section title="Timeline / Audit">
          <ul className="flex flex-col gap-1 text-xs text-slate-500">
            {auditTrail.map((a) => (
              <li key={a.id}>
                <span className="font-semibold text-slate-700">{AUDIT_LABEL[a.action] ?? a.action}</span> · {a.actor} · {fmt(a.at)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Priority */}
      <Section title="Prioritas">
        <p className="text-lg font-black text-slate-800">
          {Math.round(lead.latestPriority?.score ?? lead.priorityScore)}
          <span className="text-slate-400 font-semibold text-sm"> / {lead.latestPriority?.level ?? lead.priorityLevel}</span>
        </p>
        {priorityReasons.length > 0 && <p className="text-xs text-slate-500 mt-1">{priorityReasons.join(" · ")}</p>}
        {priorityModifiers.length > 0 && (
          <p className="text-[11px] text-amber-600 mt-0.5">{priorityModifiers.join(" · ")}</p>
        )}
        {!lead.latestPriority && (
          <p className="text-xs text-slate-400 mt-1">Belum pernah dihitung ulang — akan terisi saat ada interaksi berikutnya.</p>
        )}
      </Section>

      {/* AI Insight */}
      <Section
        title="AI Insight — Perkiraan"
        right={
          <button onClick={runAi} disabled={aiBusy} className="text-xs font-bold text-blue-700 disabled:opacity-50">
            {aiBusy ? "Menganalisa…" : Object.keys(ai).length ? "Analisa ulang" : "Analisa AI"}
          </button>
        }
      >
        {Object.keys(ai).length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada analisa. Klik &quot;Analisa AI&quot; (butuh minimal 1 pesan di percakapan).</p>
        ) : (
          <div className="flex flex-col gap-2.5 text-sm">
            {ai.SEGMENTATION && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Segmentasi</p>
                <p className="text-slate-700">
                  {ai.SEGMENTATION.output?.segmentCode}{" "}
                  <span className="text-slate-400">({Math.round((ai.SEGMENTATION.confidence ?? 0) * 100)}% yakin)</span>
                </p>
                <p className="text-xs text-slate-500">{ai.SEGMENTATION.output?.reason}</p>
              </div>
            )}
            {ai.SUMMARY && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Ringkasan</p>
                <p className="text-slate-700">{ai.SUMMARY.output?.customerContext}</p>
                {ai.SUMMARY.output?.needs && <p className="text-xs text-slate-500">Kebutuhan: {ai.SUMMARY.output.needs}</p>}
                {ai.SUMMARY.output?.objections && <p className="text-xs text-slate-500">Keberatan: {ai.SUMMARY.output.objections}</p>}
                {ai.SUMMARY.output?.nextAction && <p className="text-xs text-slate-500">Next: {ai.SUMMARY.output.nextAction}</p>}
              </div>
            )}
            {ai.PROFILING && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Profil</p>
                <p className="text-xs text-slate-600">
                  Ukuran: {ai.PROFILING.output?.companySize} · Minat: {ai.PROFILING.output?.buyingInterest} · Daya beli:{" "}
                  {ai.PROFILING.output?.buyingPower} · Peluang closing: {ai.PROFILING.output?.closingProbability}
                </p>
                {ai.PROFILING.output?.summary && <p className="text-xs text-slate-500 mt-0.5">{ai.PROFILING.output.summary}</p>}
              </div>
            )}
            {ai.NEXT_BEST_ACTION && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Next Best Action</p>
                <p className="text-slate-700">{ai.NEXT_BEST_ACTION.output?.action}</p>
                <p className="text-xs text-slate-500">{ai.NEXT_BEST_ACTION.output?.reason}</p>
              </div>
            )}
            {ai.BUYING_SIGNAL && (
              <div>
                <p className="text-xs font-black uppercase text-slate-400">Buying Signal</p>
                <p className="text-slate-700">
                  {ai.BUYING_SIGNAL.output?.score}/100 <span className="text-xs text-slate-500">— {ai.BUYING_SIGNAL.output?.reason}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </Section>

      </div>

      {/* Catatan Manual — freeform, dicap waktu+tanggal otomatis (LeadNote, sama dengan yang di
          Inbox). Kolom kanan biar tetap kelihatan sambil scroll section kiri. */}
      <div className="lg:col-span-4 flex flex-col gap-3 lg:sticky lg:top-4">
        <Section title="Catatan Manual">
          {canAct && (
            <div className="flex flex-col gap-2 mb-3">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={3}
                placeholder="Tulis catatan tambahan…"
                sizeVariant="sm"
              />
              <Button size="sm" isLoading={savingNote} disabled={!noteDraft.trim()} onClick={addNote} className="self-start">
                Simpan Catatan
              </Button>
            </div>
          )}
          {leadNotes.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada catatan.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-[28rem] overflow-y-auto">
              {leadNotes.map((n) => (
                <li key={n.id} className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <p className="whitespace-pre-wrap break-words text-slate-700">{n.body}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{n.author.name} · {fmt(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      </div>
    </div>
  )
}
