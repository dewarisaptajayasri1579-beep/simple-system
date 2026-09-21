"use client"

import React, { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Badge, Button, Card, CardTitle, CardDescription, Input, Spinner } from "@/components/ui"

interface HrSettings {
  jamMasuk: string
  jamPulang: string
  toleransiJarakM: number
  kantorLat: number | null
  kantorLng: number | null
  tglCutoff: number
  nominalLembur: number
  premiKehadiran: number
}

interface LeaveType {
  id: string
  name: string
}

interface NationalHoliday {
  id: string
  date: string
  name: string
}

export default function PengaturanHrdPage() {
  const [settings, setSettings] = useState<HrSettings | null>(null)
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [holidays, setHolidays] = useState<NationalHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [newLeaveType, setNewLeaveType] = useState("")
  const [newHolidayDate, setNewHolidayDate] = useState("")
  const [newHolidayName, setNewHolidayName] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const [sRes, ltRes, hRes] = await Promise.all([
        fetch("/api/administratif/pengaturan-hrd", { cache: "no-store" }),
        fetch("/api/administratif/jenis-izin", { cache: "no-store" }),
        fetch("/api/administratif/libur-nasional", { cache: "no-store" }),
      ])
      const [sData, ltData, hData] = await Promise.all([sRes.json(), ltRes.json(), hRes.json()])
      setSettings(sData.settings)
      setLeaveTypes(Array.isArray(ltData.leaveTypes) ? ltData.leaveTypes : [])
      setHolidays(Array.isArray(hData.holidays) ? hData.holidays : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await fetch("/api/administratif/pengaturan-hrd", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const addLeaveType = async () => {
    if (!newLeaveType.trim()) return
    await fetch("/api/administratif/jenis-izin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newLeaveType.trim() }),
    })
    setNewLeaveType("")
    await load()
  }

  const deleteLeaveType = async (id: string) => {
    await fetch(`/api/administratif/jenis-izin/${id}`, { method: "DELETE" })
    await load()
  }

  const addHoliday = async () => {
    if (!newHolidayDate || !newHolidayName.trim()) return
    await fetch("/api/administratif/libur-nasional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newHolidayDate, name: newHolidayName.trim() }),
    })
    setNewHolidayDate("")
    setNewHolidayName("")
    await load()
  }

  const deleteHoliday = async (id: string) => {
    await fetch(`/api/administratif/libur-nasional/${id}`, { method: "DELETE" })
    await load()
  }

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black text-slate-900">Pengaturan Absensi</h1>
        <p className="text-sm text-slate-600 font-medium mt-1">Jam kerja, radius lokasi, cutoff, dan master data.</p>
      </div>

      <Card variant="glass" padding="lg">
        <CardTitle>Jam Kerja &amp; Geofence</CardTitle>
        <CardDescription className="mt-1 mb-4">Satu jam kerja untuk semua karyawan.</CardDescription>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Jam Masuk" type="time" value={settings.jamMasuk} onChange={(e) => setSettings({ ...settings, jamMasuk: e.target.value })} />
          <Input label="Jam Pulang" type="time" value={settings.jamPulang} onChange={(e) => setSettings({ ...settings, jamPulang: e.target.value })} />
          <Input
            label="Latitude Kantor"
            type="number"
            value={settings.kantorLat ?? ""}
            onChange={(e) => setSettings({ ...settings, kantorLat: e.target.value ? parseFloat(e.target.value) : null })}
          />
          <Input
            label="Longitude Kantor"
            type="number"
            value={settings.kantorLng ?? ""}
            onChange={(e) => setSettings({ ...settings, kantorLng: e.target.value ? parseFloat(e.target.value) : null })}
          />
          <Input
            label="Radius Geofence (meter)"
            type="number"
            value={settings.toleransiJarakM}
            onChange={(e) => setSettings({ ...settings, toleransiJarakM: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
      </Card>

      <Card variant="glass" padding="lg">
        <CardTitle>Penggajian</CardTitle>
        <CardDescription className="mt-1 mb-4">Dipakai saat mesin hitung Penggajian dibangun.</CardDescription>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Tanggal Cutoff"
            type="number"
            value={settings.tglCutoff}
            onChange={(e) => setSettings({ ...settings, tglCutoff: parseInt(e.target.value, 10) || 0 })}
          />
          <Input
            label="Pembagi Lembur"
            type="number"
            value={settings.nominalLembur}
            onChange={(e) => setSettings({ ...settings, nominalLembur: parseFloat(e.target.value) || 0 })}
            helperText="Kepmenakertrans No.102/MEN/VI/2004 = 173"
          />
          <Input
            label="Premi Kehadiran (Rp)"
            type="number"
            value={settings.premiKehadiran}
            onChange={(e) => setSettings({ ...settings, premiKehadiran: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={saveSettings} disabled={saving}>
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </Button>
      </div>

      <Card variant="glass" padding="lg">
        <CardTitle>Jenis Izin</CardTitle>
        <div className="flex flex-wrap gap-2 mt-3 mb-4">
          {leaveTypes.map((lt) => (
            <Badge key={lt.id} variant="secondary" className="gap-2">
              {lt.name}
              <button onClick={() => deleteLeaveType(lt.id)} aria-label="Hapus" className="hover:text-rose-600">
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {leaveTypes.length === 0 && <p className="text-sm text-slate-500">Belum ada jenis izin.</p>}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Mis. Sakit, Izin, Cuti" value={newLeaveType} onChange={(e) => setNewLeaveType(e.target.value)} sizeVariant="md" />
          <Button variant="secondary" onClick={addLeaveType}>
            <Plus className="w-4 h-4" /> Tambah
          </Button>
        </div>
      </Card>

      <Card variant="glass" padding="lg">
        <CardTitle>Tanggal Libur Nasional</CardTitle>
        <div className="flex flex-col gap-2 mt-3 mb-4">
          {holidays.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-sm bg-white/50 rounded-xl px-3 py-2">
              <span className="font-semibold">{new Date(h.date).toLocaleDateString("id-ID")} — {h.name}</span>
              <button onClick={() => deleteHoliday(h.id)} aria-label="Hapus" className="text-slate-400 hover:text-rose-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {holidays.length === 0 && <p className="text-sm text-slate-500">Belum ada tanggal libur.</p>}
        </div>
        <div className="flex gap-2">
          <Input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} sizeVariant="md" />
          <Input placeholder="Nama libur" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} sizeVariant="md" />
          <Button variant="secondary" onClick={addHoliday}>
            <Plus className="w-4 h-4" /> Tambah
          </Button>
        </div>
      </Card>
    </div>
  )
}
