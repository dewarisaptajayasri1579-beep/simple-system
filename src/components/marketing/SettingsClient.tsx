"use client"

import { useCallback, useEffect, useState } from "react"

import { MarketingMasterList } from "./MarketingMasterList"

interface Team {
  id: string
  name: string
  code: string
  isActive: boolean
  managerUser: { id: string; name: string } | null
  memberships: { id: string; membershipRole: string; user: { id: string; name: string }; supervisorUser: { id: string; name: string } | null }[]
}

const SETTING_LABEL: Record<string, string> = {
  "follow_up.grace_minutes": "Grace follow up (menit) — batas 'tepat waktu' setelah jadwal",
  "ai.segment_auto_apply_confidence": "Confidence minimum auto-apply segmentasi AI (0–1)",
  "priority.weight_temperature": "Bobot: Temperatur",
  "priority.weight_activity": "Bobot: Aktivitas / Tahap",
  "priority.weight_follow_up": "Bobot: Hasil Follow Up",
  "priority.weight_recency": "Bobot: Recency / Idle",
  "priority.weight_ai": "Bobot: AI Buying Signal",
}
const WEIGHT_KEYS = new Set([
  "priority.weight_temperature",
  "priority.weight_activity",
  "priority.weight_follow_up",
  "priority.weight_recency",
  "priority.weight_ai",
])

export const SettingsClient: React.FC = () => {
  const [tab, setTab] = useState<"umum" | "master" | "tim">("umum")
  const [settings, setSettings] = useState<Record<string, number>>({})
  const [canEdit, setCanEdit] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    const [s, t, m] = await Promise.all([
      fetch("/api/marketing/settings", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/marketing/teams", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/marketing/meta").then((r) => r.json()),
    ])
    if (s.settings) {
      setSettings(s.settings)
      setCanEdit(s.canEdit)
    }
    if (t.teams) setTeams(t.teams)
    if (m.users) setUsers(m.users)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const saveSettings = async () => {
    setMsg(null)
    setError(null)
    const res = await fetch("/api/marketing/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
    const d = await res.json()
    if (!res.ok) setError(d.error || "Gagal menyimpan")
    else {
      setSettings(d.settings)
      setMsg("Tersimpan.")
    }
  }

  const [newTeam, setNewTeam] = useState({ name: "", code: "", managerUserId: "" })
  const createTeam = async () => {
    setError(null)
    const res = await fetch("/api/marketing/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTeam),
    })
    const d = await res.json()
    if (!res.ok) setError(d.error || "Gagal")
    else {
      setNewTeam({ name: "", code: "", managerUserId: "" })
      loadAll()
    }
  }

  const addMember = async (teamId: string, userId: string, membershipRole: string) => {
    const res = await fetch(`/api/marketing/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, membershipRole }),
    })
    if (res.ok) loadAll()
    else setError((await res.json()).error || "Gagal")
  }

  const removeMember = async (teamId: string, membershipId: string) => {
    const res = await fetch(`/api/marketing/teams/${teamId}/members?membershipId=${membershipId}`, { method: "DELETE" })
    if (res.ok) loadAll()
  }

  const inputCls = "px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <h1 className="text-xl font-black text-slate-900">Pengaturan Marketing</h1>
      {!canEdit && (
        <p className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          Hanya Manager / Owner yang bisa mengubah. Kamu bisa lihat saja.
        </p>
      )}
      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
      {msg && <p className="text-sm font-semibold text-emerald-600">{msg}</p>}

      <div className="flex gap-1.5">
        {(["umum", "master", "tim"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${tab === t ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
          >
            {t === "umum" ? "Umum" : t === "master" ? "Master Data" : "Tim"}
          </button>
        ))}
      </div>

      {tab === "umum" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
          {Object.keys(settings)
            .filter((k) => !WEIGHT_KEYS.has(k))
            .map((k) => (
              <label key={k} className="text-xs font-semibold text-slate-600">
                {SETTING_LABEL[k] ?? k}
                <input
                  type="number"
                  step="any"
                  value={settings[k]}
                  disabled={!canEdit}
                  onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }))}
                  className={`${inputCls} mt-1 w-full disabled:bg-slate-50`}
                />
              </label>
            ))}

          <div className="mt-1 pt-3 border-t border-slate-100">
            <p className="text-xs font-black uppercase text-slate-500">Bobot Priority Score</p>
            <p className="text-[11px] text-slate-400 mb-2">
              Total otomatis dinormalisasi ke 1. Setelah ubah, skor lama ikut kehitung ulang saat lead
              berikutnya ada interaksi (atau jalankan `scripts/recalc-marketing-priority.ts`).
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[...WEIGHT_KEYS].map((k) => (
                <label key={k} className="text-xs font-semibold text-slate-600">
                  {SETTING_LABEL[k]}
                  <input
                    type="number"
                    step="any"
                    value={settings[k] ?? 0}
                    disabled={!canEdit}
                    onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }))}
                    className={`${inputCls} mt-1 w-full disabled:bg-slate-50`}
                  />
                </label>
              ))}
            </div>
          </div>

          {canEdit && (
            <button onClick={saveSettings} className="self-start px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold">
              Simpan
            </button>
          )}
        </div>
      )}

      {tab === "master" && (
        <div className="flex flex-col gap-2">
          <MarketingMasterList
            title="Segmentasi"
            endpoint="/api/marketing/segments"
            listKey="segments"
            canDelete
            fields={[
              { key: "code", label: "Kode", type: "text", createOnly: true },
              { key: "name", label: "Nama", type: "text" },
              { key: "description", label: "Deskripsi", type: "text" },
              { key: "aiContext", label: "Konteks AI", type: "text" },
              { key: "leadCount", label: "Lead", type: "text", createOnly: true },
              { key: "isActive", label: "Aktif", type: "bool" },
            ]}
          />
          <MarketingMasterList
            title="Sumber Lead"
            endpoint="/api/marketing/sources"
            listKey="sources"
            canDelete
            fields={[
              { key: "code", label: "Kode", type: "text", createOnly: true },
              { key: "name", label: "Nama", type: "text" },
              { key: "isActive", label: "Aktif", type: "bool" },
            ]}
          />
          <MarketingMasterList
            title="Jenis Aktivitas (stageRank & score → tahapan + skor)"
            endpoint="/api/marketing/activity-types"
            listKey="activityTypes"
            canCreate={false}
            fields={[
              { key: "code", label: "Kode", type: "text", createOnly: true },
              { key: "name", label: "Nama", type: "text" },
              { key: "stageRank", label: "Rank", type: "number", width: "70px" },
              { key: "score", label: "Skor", type: "number", width: "70px" },
              { key: "isActive", label: "Aktif", type: "bool" },
            ]}
          />
          <MarketingMasterList
            title="Hasil Follow Up (priorityScoreEffect → komponen skor)"
            endpoint="/api/marketing/result-types"
            listKey="resultTypes"
            canCreate={false}
            fields={[
              { key: "code", label: "Kode", type: "text", createOnly: true },
              { key: "name", label: "Nama", type: "text" },
              { key: "priorityScoreEffect", label: "Efek Skor", type: "number", width: "80px" },
              { key: "temperatureSignalScore", label: "Sinyal Temp", type: "number", width: "80px" },
              { key: "isActive", label: "Aktif", type: "bool" },
            ]}
          />
          <MarketingMasterList
            title="Alasan LOST"
            endpoint="/api/marketing/lost-reasons"
            listKey="lostReasons"
            canDelete
            fields={[
              { key: "code", label: "Kode", type: "text", createOnly: true },
              { key: "name", label: "Nama", type: "text" },
              { key: "isActive", label: "Aktif", type: "bool" },
            ]}
          />
        </div>
      )}

      {tab === "tim" && (
        <div className="flex flex-col gap-3">
          {canEdit && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-2">
              <p className="text-xs font-black uppercase text-slate-500">Buat Tim</p>
              <div className="flex flex-wrap gap-2">
                <input placeholder="Nama tim" value={newTeam.name} onChange={(e) => setNewTeam((t) => ({ ...t, name: e.target.value }))} className={inputCls} />
                <input placeholder="Kode (mis. TIM-A)" value={newTeam.code} onChange={(e) => setNewTeam((t) => ({ ...t, code: e.target.value }))} className={inputCls} />
                <select value={newTeam.managerUserId} onChange={(e) => setNewTeam((t) => ({ ...t, managerUserId: e.target.value }))} className={inputCls}>
                  <option value="">Manager…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button onClick={createTeam} disabled={!newTeam.name || !newTeam.code} className="px-3 py-2 rounded-xl bg-blue-700 text-white text-xs font-bold disabled:opacity-40">
                  Buat
                </button>
              </div>
            </div>
          )}

          {teams.map((team) => (
            <div key={team.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-800">
                  {team.name} <span className="text-slate-400 font-semibold">· {team.code}</span>
                </p>
                <span className="text-xs text-slate-400">Manager: {team.managerUser?.name ?? "—"}</span>
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {team.memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {m.user.name} <span className="text-[10px] font-bold text-slate-400">{m.membershipRole}</span>
                    </span>
                    {canEdit && (
                      <button onClick={() => removeMember(team.id, m.id)} className="text-[11px] font-bold text-rose-600">
                        Keluarkan
                      </button>
                    )}
                  </li>
                ))}
                {team.memberships.length === 0 && <li className="text-xs text-slate-400">Belum ada anggota.</li>}
              </ul>
              {canEdit && <AddMember users={users} onAdd={(uid, role) => addMember(team.id, uid, role)} />}
            </div>
          ))}
          {teams.length === 0 && <p className="text-sm text-slate-400">Belum ada tim.</p>}
        </div>
      )}
    </div>
  )
}

const AddMember: React.FC<{ users: { id: string; name: string }[]; onAdd: (userId: string, role: string) => void }> = ({ users, onAdd }) => {
  const [uid, setUid] = useState("")
  const [role, setRole] = useState("SALES")
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <select value={uid} onChange={(e) => setUid(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs">
        <option value="">Tambah anggota…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select value={role} onChange={(e) => setRole(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs">
        <option value="SALES">SALES</option>
        <option value="SPV">SPV</option>
        <option value="MEMBER">MEMBER</option>
      </select>
      <button
        onClick={() => uid && onAdd(uid, role)}
        disabled={!uid}
        className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-40"
      >
        Tambah
      </button>
    </div>
  )
}
