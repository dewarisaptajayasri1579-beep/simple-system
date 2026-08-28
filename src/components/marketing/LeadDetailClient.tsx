"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, MessageSquare } from "lucide-react"

import { CompleteFollowUpForm } from "./CompleteFollowUpForm"

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [segments, setSegments] = useState<Opt[]>([])
  const [lostReasons, setLostReasons] = useState<Opt[]>([])
  const [activityTypes, setActivityTypes] = useState<ActivityTypeOpt[]>([])
  const [resultTypes, setResultTypes] = useState<Opt[]>([])
  const [lostPick, setLostPick] = useState("")

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

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.segments) setSegments(d.segments)
        if (d.lostReasons) setLostReasons(d.lostReasons)
        if (d.activityTypes) setActivityTypes(d.activityTypes)
        if (d.followUpResultTypes) setResultTypes(d.followUpResultTypes)
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

  if (loading) return <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>
  if (!lead) return <p className="text-sm font-semibold text-rose-600 py-10 text-center">{error ?? "Lead tidak ditemukan"}</p>

  const Section: React.FC<{ title: string; children: React.ReactNode; right?: React.ReactNode }> = ({ title, children, right }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  )

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <Link href="/marketing/leads" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Semua Lead
      </Link>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900">{lead.displayName}</h1>
            <p className="text-sm text-slate-500">
              {lead.companyName ? `${lead.companyName} · ` : ""}
              {lead.whatsappNumber}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              PIC: {pic?.name ?? "belum ada"} · dibuat {fmt(lead.createdAt)}
            </p>
          </div>
          {lead.conversations[0] && (
            <Link
              href={`/marketing/inbox/${lead.conversations[0].id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 text-white text-xs font-bold flex-shrink-0"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Chat
            </Link>
          )}
        </div>
        {!canAct && (
          <p className="mt-3 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            Kamu memantau lead ini. Tombol aksi dinonaktifkan — hanya PIC / SPV / Manager yang bisa mengubah.
          </p>
        )}
      </div>

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
        <p className="text-sm font-bold text-slate-800">
          {Math.round(lead.latestPriority?.score ?? lead.priorityScore)}{" "}
          <span className="text-slate-400 font-semibold">/ {lead.latestPriority?.level ?? lead.priorityLevel}</span>
        </p>
        {Array.isArray(lead.latestPriority?.reasonJson) && (lead.latestPriority!.reasonJson as unknown[]).length > 0 && (
          <p className="text-xs text-slate-500 mt-1">{(lead.latestPriority!.reasonJson as string[]).join(" · ")}</p>
        )}
        {!lead.latestPriority && (
          <p className="text-xs text-slate-400 mt-1">Belum pernah dihitung ulang — akan terisi saat ada interaksi berikutnya.</p>
        )}
      </Section>

      {/* Identitas */}
      <Section
        title="Identitas & Segmen"
        right={
          canAct ? (
            <button
              disabled={busy}
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
              className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold disabled:opacity-40"
            >
              Simpan
            </button>
          ) : null
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(
            [
              ["displayName", "Nama"],
              ["companyName", "Perusahaan"],
              ["contactName", "Nama Kontak"],
              ["email", "Email"],
              ["city", "Kota"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-xs font-semibold text-slate-500">
              {label}
              <input
                value={form[key]}
                disabled={!canAct}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="mt-1 w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50"
              />
            </label>
          ))}
          <label className="text-xs font-semibold text-slate-500">
            Segmen
            <select
              value={form.segmentId}
              disabled={!canAct}
              onChange={(e) => setForm((f) => ({ ...f, segmentId: e.target.value }))}
              className="mt-1 w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50"
            >
              <option value="">— belum —</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
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
          <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
            <select
              value={actForm.activityTypeId}
              onChange={(e) => setActForm((f) => ({ ...f, activityTypeId: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
            >
              <option value="">Jenis aktivitas…</option>
              {activityTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={actForm.occurredAt}
              onChange={(e) => setActForm((f) => ({ ...f, occurredAt: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
            />
            <textarea
              value={actForm.note}
              onChange={(e) => setActForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              placeholder="Catatan (opsional)"
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400 resize-none"
            />
            <button
              disabled={busy || !actForm.activityTypeId}
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
              className="self-start px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold disabled:opacity-40"
            >
              Simpan Aktivitas
            </button>
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
          <div className="mb-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
            <input
              type="datetime-local"
              value={fuForm.scheduledAt}
              onChange={(e) => setFuForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
            />
            <input
              value={fuForm.purpose}
              onChange={(e) => setFuForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="Tujuan follow up"
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"
            />
            <textarea
              value={fuForm.note}
              onChange={(e) => setFuForm((f) => ({ ...f, note: e.target.value }))}
              rows={2}
              placeholder="Catatan (opsional)"
              className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400 resize-none"
            />
            <button
              disabled={busy || !fuForm.scheduledAt || !fuForm.purpose.trim()}
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
              className="self-start px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold disabled:opacity-40"
            >
              Simpan Follow Up
            </button>
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
    </div>
  )
}
