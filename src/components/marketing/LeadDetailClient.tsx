"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MessageSquare } from "lucide-react"

import { Alert, Badge, Button, Card, Input, Select, SkeletonList, Textarea } from "@/components/ui"
import { CompleteFollowUpForm } from "./CompleteFollowUpForm"
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
  conversations: { id: string; channel: string; lastMessageAt: string | null; unreadCustomerCount: number }[]
  activities: {
    id: string
    type: { code: string; name: string }
    actorUser: Opt
    occurredAt: string
    note: string | null
    result: string | null
    isVoid: boolean
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
const OUTCOMES = ["OPEN", "WON", "LOST"] as const
const TEMP_BTN: Record<string, string> = {
  HOT: "bg-rose-600 text-white border-rose-600",
  WARM: "bg-amber-500 text-white border-amber-500",
  COLD: "bg-slate-500 text-white border-slate-500",
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [segments, setSegments] = useState<Opt[]>([])
  const [lostReasons, setLostReasons] = useState<Opt[]>([])
  const [activityTypes, setActivityTypes] = useState<ActivityTypeOpt[]>([])
  const [resultTypes, setResultTypes] = useState<Opt[]>([])
  const [users, setUsers] = useState<Opt[]>([])
  const [lostPick, setLostPick] = useState("")

  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignTo, setReassignTo] = useState("")
  const [reassignReason, setReassignReason] = useState("")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ai, setAi] = useState<Record<string, any>>({})
  const [aiBusy, setAiBusy] = useState(false)

  const [actOpen, setActOpen] = useState(false)
  const [actForm, setActForm] = useState({ activityTypeId: "", occurredAt: "", note: "" })
  const [fuOpen, setFuOpen] = useState(false)
  const [fuForm, setFuForm] = useState({ scheduledAt: "", purpose: "", note: "" })
  const [completingFu, setCompletingFu] = useState<string | null>(null)

  const [form, setForm] = useState({ displayName: "", companyName: "", contactName: "", email: "", city: "", segmentId: "" })

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
      setForm({
        displayName: data.lead.displayName ?? "",
        companyName: data.lead.companyName ?? "",
        contactName: data.lead.contactName ?? "",
        email: data.lead.email ?? "",
        city: data.lead.city ?? "",
        segmentId: data.lead.segment?.id ?? "",
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

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.segments) setSegments(d.segments)
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
    <div className="flex flex-col gap-3 max-w-3xl">
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

      {/* Outcome */}
      <Section title="Outcome">
        <div className="flex gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              disabled={!canAct || busy}
              onClick={() => {
                if (o === "LOST") return
                call(`/api/marketing/leads/${leadId}/outcome`, { outcome: o })
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-50 ${
                lead.outcome === o ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        {canAct && (
          <div className="mt-2 flex gap-2">
            <select
              value={lostPick}
              onChange={(e) => setLostPick(e.target.value)}
              className="flex-1 px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold outline-none focus:border-blue-400"
            >
              <option value="">Alasan LOST…</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button
              disabled={!lostPick || busy}
              onClick={() => call(`/api/marketing/leads/${leadId}/outcome`, { outcome: "LOST", lostReasonId: lostPick })}
              className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-40"
            >
              Set LOST
            </button>
          </div>
        )}
        {lead.outcome === "LOST" && lead.lostReason && (
          <p className="text-xs text-slate-500 mt-2">Alasan: {lead.lostReason.name}</p>
        )}
      </Section>

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
          <div>
            <label className="text-xs sm:text-sm font-bold text-slate-700">Segmen</label>
            <div className="mt-1.5">
              <Select
                options={[{ value: "", label: "— belum —" }, ...segments.map((s) => ({ value: s.id, label: s.name }))]}
                value={form.segmentId}
                disabled={!canAct}
                onChange={(v) => setForm((f) => ({ ...f, segmentId: v }))}
                sizeVariant="sm"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Aktivitas */}
      <Section
        title={`Aktivitas (${lead.activities.length})`}
        right={
          canAct ? (
            <button onClick={() => setActOpen((v) => !v)} className="text-xs font-bold text-blue-700">
              {actOpen ? "Tutup" : "+ Tambah"}
            </button>
          ) : null
        }
      >
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
              placeholder="Catatan (opsional)"
              sizeVariant="sm"
            />
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
                })
                if (ok) {
                  setActForm({ activityTypeId: "", occurredAt: "", note: "" })
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
    </div>
  )
}
