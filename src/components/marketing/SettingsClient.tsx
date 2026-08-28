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

const SETTING_META: Record<string, { label: string; help: string }> = {
  "follow_up.grace_minutes": {
    label: "Grace follow up (menit)",
    help: "Follow up yang diselesaikan sampai sekian menit setelah jadwalnya masih dihitung 'tepat waktu'. Lewat dari itu → 'telat' di KPI on-time.",
  },
  "follow_up.reminder_before_minutes": {
    label: "Reminder sebelum jatuh tempo (menit)",
    help: "Berapa menit sebelum jadwal follow up, PIC mulai dapat notifikasi pengingat.",
  },
  "follow_up.overdue_reminder_hours": {
    label: "Reminder ulang saat overdue (jam)",
    help: "Kalau follow up sudah lewat jadwal & belum dikerjakan, PIC di-ingatkan lagi tiap sekian jam (dedupe per hari).",
  },
  "follow_up.auto_schedule": {
    label: "Auto-jadwal follow up (1 = aktif)",
    help: "Kalau aktif, sistem otomatis membuat follow up saat: lead baru masuk, pesan customer masuk, aktivitas dicatat, atau follow up diselesaikan tanpa jadwal berikutnya. Selalu dilewati kalau lead sudah punya follow up OPEN. 0 = matikan.",
  },
  "follow_up.default_hours": {
    label: "Jarak auto-jadwal follow up (jam)",
    help: "Berapa jam dari sekarang follow up otomatis dijadwalkan. Dipakai kalau segmen lead tidak punya 'Default Follow Up (jam)' sendiri. Default 24.",
  },
  "ai.segment_auto_apply_confidence": {
    label: "Confidence minimum auto-apply segmentasi AI (0–1)",
    help: "AI hanya boleh menetapkan segmen otomatis kalau yakin ≥ nilai ini DAN lead belum bersegmen. Di bawah itu cuma jadi saran. Default 0.85.",
  },
  "priority.weight_temperature": { label: "Bobot: Temperatur", help: "Porsi komponen Temperatur (Cold/Warm/Hot) di skor prioritas." },
  "priority.weight_activity": { label: "Bobot: Aktivitas / Tahap", help: "Porsi tahap proses (Diskusi→Negosiasi) di skor prioritas." },
  "priority.weight_follow_up": { label: "Bobot: Hasil Follow Up", help: "Porsi hasil follow up terakhir (Minta Penawaran … Tidak Tertarik) di skor." },
  "priority.weight_recency": { label: "Bobot: Recency / Idle", help: "Porsi seberapa baru interaksi terakhir. Lead yang lama diam turun skornya." },
  "priority.weight_ai": { label: "Bobot: AI Buying Signal", help: "Porsi sinyal beli dari analisa AI (0–100)." },
  "escalation.hot_unreplied_hours": {
    label: "Escalation: Hot lead belum dibalas (jam)",
    help: "Lead HOT yang pesan customernya belum dibalas lebih dari sekian jam → notifikasi ke PIC + SPV + Manager.",
  },
  "escalation.followup_overdue_hours": {
    label: "Escalation: Follow up overdue (jam)",
    help: "Follow up yang overdue lebih dari sekian jam → di-eskalasi ke atasan PIC.",
  },
  "escalation.wa_group_unreplied_minutes": {
    label: "Alert grup WA: lead belum direspon (menit)",
    help: "Kalau ada lead OPEN yang pesan customernya belum dibalas Sales lebih dari sekian menit, sistem kirim rekap ke grup WA Marketing (cek tiap 5 menit, hormati jam kerja, 1 alert per lead sampai dibalas). 0 = matikan fitur ini.",
  },
  "escalation.negotiation_idle_days": {
    label: "Escalation: Negosiasi idle (hari)",
    help: "Lead di tahap Negosiasi tanpa interaksi lebih dari sekian hari → di-eskalasi ke atasan.",
  },
  "temperature.override_lock_hours": {
    label: "Lock manual temperatur (jam)",
    help: "Setelah Sales mengubah temperatur manual, AI/rule tidak boleh menimpanya selama sekian jam.",
  },
  "temperature.automation_mode": {
    label: "Mode temperatur otomatis",
    help: "0 = SUGGEST_ONLY: sistem hanya menyarankan, Sales yang menerapkan. 1 = AUTO (guardrail): sistem ubah sendiri, maks 1 tingkat per kejadian kecuali strong signal, dan menghormati lock manual.",
  },
  "working_hours.enabled": {
    label: "Working hours aktif",
    help: "1 = KPI response time & SLA dihitung hanya dalam jam kerja. 0 = pakai jam berjalan 24/7.",
  },
  "working_hours.start_hour": { label: "Jam mulai kerja", help: "Jam (0–23) mulai dihitung sebagai jam kerja. Contoh: 8 = 08:00 WIB." },
  "working_hours.end_hour": { label: "Jam selesai kerja", help: "Jam (0–23) berakhirnya jam kerja. Contoh: 17 = 17:00 WIB." },
  "working_hours.saturday": { label: "Sabtu hari kerja", help: "1 = Sabtu dihitung hari kerja. 0 = Sabtu libur. Minggu selalu libur, Senin–Jumat selalu kerja." },
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

  const numField = (k: string) => {
    const meta = SETTING_META[k]
    return (
      <div key={k} className="flex flex-col gap-1">
        <label className="text-sm font-bold text-slate-700">{meta?.label ?? k}</label>
        {meta?.help && <p className="text-xs font-medium text-slate-500 leading-snug">{meta.help}</p>}
        <Input
          type="number"
          step="any"
          value={settings[k] ?? 0}
          disabled={!canEdit}
          onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }))}
          sizeVariant="sm"
          className="mt-0.5"
        />
      </div>
    )
  }

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
              { key: "keywords", label: "Pesan awal mengandung (pisah koma)", type: "text" },
              { key: "keywordPriority", label: "Prioritas keyword", type: "number" },
              { key: "defaultFollowUpHours", label: "Default Follow Up (jam)", type: "number" },
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
