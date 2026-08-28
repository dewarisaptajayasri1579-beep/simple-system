"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"

interface LeadRow {
  id: string
  displayName: string
  companyName: string | null
  whatsappNumber: string
  temperature: string
  currentActivityStage: string
  priorityScore: number
  priorityLevel: string
  outcome: string
  segmentName: string | null
  pic: { id: string; name: string } | null
  lastInteractionAt: string | null
  createdAt: string
  nextFollowUpAt: string | null
  idleDays: number | null
  canAct: boolean
}

interface MetaOption {
  id: string
  name: string
}

const TEMP_BADGE: Record<string, string> = {
  HOT: "bg-rose-100 text-rose-700",
  WARM: "bg-amber-100 text-amber-700",
  COLD: "bg-slate-100 text-slate-600",
}
const STAGE_LABEL: Record<string, string> = {
  NONE: "—",
  DISCUSSION: "Diskusi",
  ZOOM_DEMO: "Zoom/Demo",
  PROPOSAL: "Penawaran",
  NEGOTIATION: "Negosiasi",
}

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })
}

export const LeadListClient: React.FC = () => {
  const [rows, setRows] = useState<LeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [scope, setScope] = useState<"all" | "mine">("all")
  const [q, setQ] = useState("")
  const [segmentId, setSegmentId] = useState("")
  const [temperature, setTemperature] = useState("")
  const [stage, setStage] = useState("")
  const [outcome, setOutcome] = useState("")
  const [priorityLevel, setPriorityLevel] = useState("")
  const [picUserId, setPicUserId] = useState("")
  const [sort, setSort] = useState("priority")

  const [segments, setSegments] = useState<MetaOption[]>([])
  const [users, setUsers] = useState<MetaOption[]>([])
  const qDebounced = useRef(q)

  useEffect(() => {
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.segments) setSegments(d.segments)
        if (d.users) setUsers(d.users)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ scope, sort, limit: "60" })
      if (qDebounced.current.trim()) p.set("q", qDebounced.current.trim())
      if (segmentId) p.set("segmentId", segmentId)
      if (temperature) p.set("temperature", temperature)
      if (stage) p.set("stage", stage)
      if (outcome) p.set("outcome", outcome)
      if (priorityLevel) p.set("priorityLevel", priorityLevel)
      if (picUserId) p.set("picUserId", picUserId)
      const res = await fetch(`/api/marketing/leads?${p}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memuat")
        return
      }
      setError(null)
      setRows(data.leads)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [scope, sort, segmentId, temperature, stage, outcome, priorityLevel, picUserId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setTimeout(() => {
      qDebounced.current = q
      load()
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const selectCls = "px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold outline-none focus:border-blue-400"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-900">
          Lead <span className="text-sm font-bold text-slate-400">({total})</span>
        </h1>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-xs font-bold">
          {(["all", "mine"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-1.5 rounded-lg transition-colors ${scope === s ? "bg-blue-700 text-white" : "text-slate-500 hover:text-slate-800"}`}
            >
              {s === "all" ? "Semua Tim" : "Punya Saya"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari nama, perusahaan, kontak, nomor…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className={selectCls}>
          <option value="">Semua Segmen</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={temperature} onChange={(e) => setTemperature(e.target.value)} className={selectCls}>
          <option value="">Semua Temperatur</option>
          <option value="HOT">Hot</option>
          <option value="WARM">Warm</option>
          <option value="COLD">Cold</option>
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={selectCls}>
          <option value="">Semua Tahap</option>
          <option value="NONE">Belum</option>
          <option value="DISCUSSION">Diskusi</option>
          <option value="ZOOM_DEMO">Zoom/Demo</option>
          <option value="PROPOSAL">Penawaran</option>
          <option value="NEGOTIATION">Negosiasi</option>
        </select>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={selectCls}>
          <option value="">Semua Outcome</option>
          <option value="OPEN">Open</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </select>
        <select value={priorityLevel} onChange={(e) => setPriorityLevel(e.target.value)} className={selectCls}>
          <option value="">Semua Prioritas</option>
          <option value="TOP">Utama</option>
          <option value="HIGH">Tinggi</option>
          <option value="MONITOR">Pantau</option>
          <option value="LOW">Rendah</option>
        </select>
        <select value={picUserId} onChange={(e) => setPicUserId(e.target.value)} className={selectCls}>
          <option value="">Semua PIC</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className={selectCls}>
          <option value="priority">Urut: Prioritas</option>
          <option value="recent">Urut: Interaksi Terbaru</option>
          <option value="created">Urut: Terbaru Dibuat</option>
        </select>
      </div>

      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 font-medium py-10 text-center">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 font-medium py-10 text-center">Tidak ada lead.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 font-bold">
                <tr>
                  <th className="text-left px-3 py-2.5">Lead</th>
                  <th className="text-left px-3 py-2.5">Segmen</th>
                  <th className="text-left px-3 py-2.5">Temp</th>
                  <th className="text-left px-3 py-2.5">Tahap</th>
                  <th className="text-right px-3 py-2.5">Skor</th>
                  <th className="text-left px-3 py-2.5">PIC</th>
                  <th className="text-left px-3 py-2.5">Idle</th>
                  <th className="text-left px-3 py-2.5">Follow Up</th>
                  <th className="text-left px-3 py-2.5">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <Link href={`/marketing/leads/${l.id}`} className="font-bold text-slate-800 hover:text-blue-700">
                        {l.displayName}
                      </Link>
                      <div className="text-xs text-slate-400">{l.companyName || l.whatsappNumber}</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{l.segmentName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TEMP_BADGE[l.temperature]}`}>{l.temperature}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{STAGE_LABEL[l.currentActivityStage] ?? l.currentActivityStage}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-700">{Math.round(l.priorityScore)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{l.pic?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500">{l.idleDays != null ? `${l.idleDays}h` : "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500">{fmtDate(l.nextFollowUpAt)}</td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{l.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="lg:hidden flex flex-col gap-1.5">
            {rows.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/marketing/leads/${l.id}`}
                  className="block p-3 rounded-2xl bg-white border border-slate-200/80 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800 truncate">{l.displayName}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TEMP_BADGE[l.temperature]}`}>{l.temperature}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{l.companyName || l.whatsappNumber}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[10px] font-bold">
                    {l.segmentName && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{l.segmentName}</span>}
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{STAGE_LABEL[l.currentActivityStage] ?? l.currentActivityStage}</span>
                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Skor {Math.round(l.priorityScore)}</span>
                    {l.outcome !== "OPEN" && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{l.outcome}</span>}
                    {l.pic && <span className="text-slate-400">PIC: {l.pic.name}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
