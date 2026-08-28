"use client"

import { useCallback, useEffect, useState } from "react"
import { Trash2, UserPlus, Users } from "lucide-react"

import { Alert, Badge, Button, Card, Input, Select, Tab, TabList, Tabs } from "@/components/ui"
import { MarketingMasterList } from "./MarketingMasterList"
import { MktHeader } from "./ui"

const ROLE_BADGE: Record<string, "info" | "warning" | "secondary"> = { SPV: "warning", SALES: "info", MEMBER: "secondary" }

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

  const [newSales, setNewSales] = useState({ name: "", email: "", password: "", phoneNumber: "", teamId: "", membershipRole: "SALES" })
  const [salesMsg, setSalesMsg] = useState<string | null>(null)
  const [salesBusy, setSalesBusy] = useState(false)
  const createSales = async () => {
    setSalesMsg(null)
    setSalesBusy(true)
    try {
      const res = await fetch("/api/marketing/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSales),
      })
      const d = await res.json()
      if (!res.ok) {
        setSalesMsg(d.error || "Gagal membuat akun")
        return
      }
      setNewSales({ name: "", email: "", password: "", phoneNumber: "", teamId: "", membershipRole: "SALES" })
      setSalesMsg(`Akun "${d.user.name}" dibuat — kasih tahu email & password-nya ke yang bersangkutan.`)
      loadAll()
    } finally {
      setSalesBusy(false)
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

  const [confirmMember, setConfirmMember] = useState<string | null>(null)
  const removeMember = async (teamId: string, membershipId: string) => {
    const res = await fetch(`/api/marketing/teams/${teamId}/members?membershipId=${membershipId}`, { method: "DELETE" })
    setConfirmMember(null)
    if (res.ok) loadAll()
    else setError((await res.json().catch(() => ({}))).error || "Gagal mengeluarkan anggota")
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
            title="Kemampuan Beli (profiling kapasitas bayar — modifier Priority Score)"
            endpoint="/api/marketing/buying-power-tiers"
            listKey="buyingPowerTiers"
            canDelete
            fields={[
              { key: "code", label: "Kode", type: "text", createOnly: true },
              { key: "name", label: "Nama", type: "text" },
              { key: "description", label: "Keterangan", type: "text" },
              { key: "sortOrder", label: "Urut", type: "number", width: "60px" },
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
        <div className="flex flex-col gap-4">
          {canEdit && (
            <Card variant="feature" padding="md" className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-4 h-4" />
                </span>
                <div>
                  <p className="text-sm font-black text-slate-800">Tambah Anggota Baru</p>
                  <p className="text-[11px] text-slate-400">
                    Akun ini cuma bisa masuk modul Marketing — tidak diberi akses Internal.
                  </p>
                </div>
              </div>
              {salesMsg && <Alert variant={salesMsg.startsWith("Akun") ? "success" : "error"}>{salesMsg}</Alert>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nama">
                  <Input placeholder="Nama lengkap" value={newSales.name} onChange={(e) => setNewSales((s) => ({ ...s, name: e.target.value }))} sizeVariant="sm" />
                </Field>
                <Field label="Email">
                  <Input placeholder="email@contoh.com" type="email" value={newSales.email} onChange={(e) => setNewSales((s) => ({ ...s, email: e.target.value }))} sizeVariant="sm" />
                </Field>
                <Field label="Password" hint="minimal 6 karakter">
                  <Input placeholder="Password awal" value={newSales.password} onChange={(e) => setNewSales((s) => ({ ...s, password: e.target.value }))} sizeVariant="sm" />
                </Field>
                <Field label="No. WhatsApp" hint="opsional">
                  <Input placeholder="08…" value={newSales.phoneNumber} onChange={(e) => setNewSales((s) => ({ ...s, phoneNumber: e.target.value }))} sizeVariant="sm" />
                </Field>
                <Field label="Tim">
                  <Select
                    options={[{ value: "", label: "Tanpa tim dulu" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                    value={newSales.teamId}
                    onChange={(v) => setNewSales((s) => ({ ...s, teamId: v }))}
                    sizeVariant="sm"
                  />
                </Field>
                <Field label="Peran di tim">
                  <Select
                    options={[
                      { value: "SALES", label: "Sales" },
                      { value: "SPV", label: "Supervisor" },
                      { value: "MEMBER", label: "Member" },
                    ]}
                    value={newSales.membershipRole}
                    onChange={(v) => setNewSales((s) => ({ ...s, membershipRole: v }))}
                    sizeVariant="sm"
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  isLoading={salesBusy}
                  onClick={createSales}
                  disabled={salesBusy || !newSales.name.trim() || !newSales.email.trim() || newSales.password.length < 6}
                >
                  Buat Akun
                </Button>
              </div>
            </Card>
          )}

          {canEdit && (
            <Card variant="feature" padding="md" className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4" />
                </span>
                <p className="text-sm font-black text-slate-800">Buat Tim</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Nama tim">
                  <Input placeholder="mis. Tim Jakarta" value={newTeam.name} onChange={(e) => setNewTeam((t) => ({ ...t, name: e.target.value }))} sizeVariant="sm" />
                </Field>
                <Field label="Kode">
                  <Input placeholder="mis. TIM-A" value={newTeam.code} onChange={(e) => setNewTeam((t) => ({ ...t, code: e.target.value }))} sizeVariant="sm" />
                </Field>
                <Field label="Manager">
                  <Select
                    options={[{ value: "", label: "Pilih manager…" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
                    value={newTeam.managerUserId}
                    onChange={(v) => setNewTeam((t) => ({ ...t, managerUserId: v }))}
                    sizeVariant="sm"
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={createTeam} disabled={!newTeam.name || !newTeam.code}>
                  Buat Tim
                </Button>
              </div>
            </Card>
          )}

          {teams.map((team) => (
            <Card key={team.id} variant="feature" padding="md" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-black text-slate-800 truncate">{team.name}</p>
                  <Badge variant="secondary" size="sm">{team.code}</Badge>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  Manager: <span className="font-semibold text-slate-600">{team.managerUser?.name ?? "—"}</span>
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {team.memberships.map((m) => (
                  <div key={m.id}>
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/70">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs font-black flex items-center justify-center flex-shrink-0">
                          {m.user.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                        <span className="text-sm font-semibold text-slate-700 truncate">{m.user.name}</span>
                        <Badge variant={ROLE_BADGE[m.membershipRole] ?? "secondary"} size="sm">{m.membershipRole}</Badge>
                        {m.supervisorUser && (
                          <span className="text-[11px] text-slate-400 truncate hidden sm:inline">SPV: {m.supervisorUser.name}</span>
                        )}
                      </div>
                      {canEdit && confirmMember !== m.id && (
                        <button
                          onClick={() => setConfirmMember(m.id)}
                          title="Keluarkan dari tim"
                          className="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {confirmMember === m.id && (
                      <div className="flex items-center justify-end gap-2 px-3 py-2 mt-1 rounded-xl bg-rose-50 border border-rose-200">
                        <span className="text-xs font-semibold text-rose-700 mr-auto">
                          Keluarkan <strong>{m.user.name}</strong> dari {team.name}?
                        </span>
                        <Button size="sm" variant="danger" onClick={() => removeMember(team.id, m.id)}>
                          Ya, keluarkan
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirmMember(null)}>
                          Batal
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {team.memberships.length === 0 && (
                  <p className="text-xs text-slate-400 px-1 py-2">Belum ada anggota.</p>
                )}
              </div>

              {canEdit && <AddMember users={users} onAdd={(uid, role) => addMember(team.id, uid, role)} />}
            </Card>
          ))}
          {teams.length === 0 && (
            <Card variant="feature" padding="lg" className="text-center text-sm text-slate-400">
              Belum ada tim. Buat tim dulu di atas.
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
      {label}
      {hint ? <span className="ml-1 font-medium normal-case tracking-normal text-slate-400">· {hint}</span> : null}
    </label>
    {children}
  </div>
)

const AddMember: React.FC<{ users: { id: string; name: string }[]; onAdd: (userId: string, role: string) => void }> = ({ users, onAdd }) => {
  const [uid, setUid] = useState("")
  const [role, setRole] = useState("SALES")
  return (
    <div className="flex flex-wrap gap-2 items-end pt-1 border-t border-slate-200/70">
      <div className="w-44">
        <Select
          options={[{ value: "", label: "Masukkan anggota lain…" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          value={uid}
          onChange={setUid}
          sizeVariant="sm"
        />
      </div>
      <div className="w-32">
        <Select
          options={[
            { value: "SALES", label: "Sales" },
            { value: "SPV", label: "Supervisor" },
            { value: "MEMBER", label: "Member" },
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
