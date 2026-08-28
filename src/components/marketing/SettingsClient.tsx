"use client"

import { useCallback, useEffect, useState } from "react"

import { Alert, Button, Card, Input, Select, Tab, TabList, Tabs } from "@/components/ui"
import { MarketingMasterList } from "./MarketingMasterList"
import { MktHeader } from "./ui"

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
  "follow_up.reminder_before_minutes": "Reminder sebelum jatuh tempo (menit)",
  "follow_up.overdue_reminder_hours": "Reminder ulang saat overdue (jam)",
  "ai.segment_auto_apply_confidence": "Confidence minimum auto-apply segmentasi AI (0–1)",
  "priority.weight_temperature": "Bobot: Temperatur",
  "priority.weight_activity": "Bobot: Aktivitas / Tahap",
  "priority.weight_follow_up": "Bobot: Hasil Follow Up",
  "priority.weight_recency": "Bobot: Recency / Idle",
  "priority.weight_ai": "Bobot: AI Buying Signal",
  "escalation.hot_unreplied_hours": "Escalation: Hot lead belum dibalas (jam)",
  "escalation.followup_overdue_hours": "Escalation: Follow up overdue (jam)",
  "escalation.negotiation_idle_days": "Escalation: Negosiasi idle (hari)",
  "temperature.override_lock_hours": "Lock manual temperatur (jam)",
  "temperature.automation_mode": "Mode temperatur: 0 = SUGGEST_ONLY, 1 = AUTO (guardrail)",
  "working_hours.enabled": "Working hours aktif (1 = ya, 0 = 24/7)",
  "working_hours.start_hour": "Jam mulai kerja",
  "working_hours.end_hour": "Jam selesai kerja",
  "working_hours.saturday": "Sabtu hari kerja (1/0)",
}
const WEIGHT_KEYS = [
  "priority.weight_temperature",
  "priority.weight_activity",
  "priority.weight_follow_up",
  "priority.weight_recency",
  "priority.weight_ai",
]

export const SettingsClient: React.FC = () => {
  const [tab, setTab] = useState("umum")
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
    if (!res.ok) return setError(d.error || "Gagal")
    setNewTeam({ name: "", code: "", managerUserId: "" })
    loadAll()
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

  const numField = (k: string) => (
    <Input
      key={k}
      type="number"
      step="any"
      label={SETTING_LABEL[k] ?? k}
      value={settings[k] ?? 0}
      disabled={!canEdit}
      onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }))}
      sizeVariant="sm"
    />
  )

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <MktHeader title="Pengaturan Marketing" />
      {!canEdit && <Alert variant="info">Hanya Manager / Owner yang bisa mengubah. Kamu bisa lihat saja.</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {msg && <Alert variant="success">{msg}</Alert>}

      <Tabs value={tab} onChange={setTab}>
        <TabList>
          <Tab value="umum">Umum</Tab>
          <Tab value="master">Master Data</Tab>
          <Tab value="tim">Tim</Tab>
        </TabList>
      </Tabs>

      {tab === "umum" && (
        <Card variant="feature" padding="md" className="flex flex-col gap-3">
          {Object.keys(settings)
            .filter((k) => !WEIGHT_KEYS.includes(k))
            .map((k) => numField(k))}

          <div className="mt-1 pt-3 border-t border-slate-100">
            <p className="text-xs font-black uppercase text-slate-500">Bobot Priority Score</p>
            <p className="text-[11px] text-slate-400 mb-2">
              Total otomatis dinormalisasi ke 1. Setelah ubah, skor lama kehitung ulang saat lead berikutnya ada interaksi
              (atau jalankan <code>scripts/recalc-marketing-priority.ts</code>).
            </p>
            <div className="grid grid-cols-2 gap-2">{WEIGHT_KEYS.map((k) => numField(k))}</div>
          </div>

          {canEdit && (
            <Button size="sm" onClick={saveSettings} className="self-start">
              Simpan
            </Button>
          )}
        </Card>
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
            title="Hasil Follow Up (normalizedScore → komponen skor)"
            endpoint="/api/marketing/result-types"
            listKey="resultTypes"
            canCreate={false}
            fields={[
              { key: "code", label: "Kode", type: "text", createOnly: true },
              { key: "name", label: "Nama", type: "text" },
              { key: "normalizedScore", label: "Skor 0-100", type: "number", width: "90px" },
              { key: "priorityScoreEffect", label: "Efek", type: "number", width: "70px" },
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
            <Card variant="feature" padding="md" className="flex flex-col gap-2">
              <p className="text-xs font-black uppercase text-slate-500">Buat Tim</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-40">
                  <Input placeholder="Nama tim" value={newTeam.name} onChange={(e) => setNewTeam((t) => ({ ...t, name: e.target.value }))} sizeVariant="sm" />
                </div>
                <div className="w-36">
                  <Input placeholder="Kode (mis. TIM-A)" value={newTeam.code} onChange={(e) => setNewTeam((t) => ({ ...t, code: e.target.value }))} sizeVariant="sm" />
                </div>
                <div className="w-44">
                  <Select
                    options={[{ value: "", label: "Manager…" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
                    value={newTeam.managerUserId}
                    onChange={(v) => setNewTeam((t) => ({ ...t, managerUserId: v }))}
                    sizeVariant="sm"
                  />
                </div>
                <Button size="sm" onClick={createTeam} disabled={!newTeam.name || !newTeam.code}>
                  Buat
                </Button>
              </div>
            </Card>
          )}

          {teams.map((team) => (
            <Card key={team.id} variant="feature" padding="md">
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
            </Card>
          ))}
          {teams.length === 0 && (
            <Card variant="feature" padding="lg" className="text-center text-sm text-slate-400">
              Belum ada tim.
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

const AddMember: React.FC<{ users: { id: string; name: string }[]; onAdd: (userId: string, role: string) => void }> = ({ users, onAdd }) => {
  const [uid, setUid] = useState("")
  const [role, setRole] = useState("SALES")
  return (
    <div className="mt-2 flex flex-wrap gap-2 items-end">
      <div className="w-44">
        <Select
          options={[{ value: "", label: "Tambah anggota…" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          value={uid}
          onChange={setUid}
          sizeVariant="sm"
        />
      </div>
      <div className="w-32">
        <Select
          options={[
            { value: "SALES", label: "SALES" },
            { value: "SPV", label: "SPV" },
            { value: "MEMBER", label: "MEMBER" },
          ]}
          value={role}
          onChange={setRole}
          sizeVariant="sm"
        />
      </div>
      <Button size="sm" variant="secondary" onClick={() => uid && onAdd(uid, role)} disabled={!uid}>
        Tambah
      </Button>
    </div>
  )
}
