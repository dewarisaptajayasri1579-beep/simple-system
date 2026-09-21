"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Settings } from "lucide-react"

import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Textarea,
} from "@/components/ui"

interface EmployeeOption {
  id: string
  name: string
}

interface AttendanceRecord {
  id: string
  date: string
  status: "O" | "I" | "C"
  checkInAt: string | null
  checkOutAt: string | null
  checkInLate: boolean
  workDurationMinutes: number | null
  source: string
  employee: { id: string; name: string; position: string | null }
}

interface LeaveType {
  id: string
  name: string
}

interface LeaveRequest {
  id: string
  date: string
  notes: string | null
  employee: { id: string; name: string }
  leaveType: { id: string; name: string }
}

const STATUS_LABEL: Record<AttendanceRecord["status"], string> = { O: "Belum Absen", I: "Sudah Masuk", C: "Selesai" }
const STATUS_BADGE: Record<AttendanceRecord["status"], "secondary" | "info" | "success"> = { O: "secondary", I: "info", C: "success" }

function fmtTime(iso: string | null) {
  if (!iso) return "-"
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
}

export default function AbsensiPage() {
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionForm, setCorrectionForm] = useState({ employeeId: "", date: "", checkInAt: "", checkOutAt: "" })
  const [correctionSaving, setCorrectionSaving] = useState(false)
  const [correctionError, setCorrectionError] = useState("")

  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ employeeId: "", leaveTypeId: "", date: "", notes: "" })
  const [leaveSaving, setLeaveSaving] = useState(false)
  const [leaveError, setLeaveError] = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const [empRes, recRes, ltRes, lrRes] = await Promise.all([
        fetch("/api/administratif/karyawan", { cache: "no-store" }),
        fetch("/api/administratif/absensi", { cache: "no-store" }),
        fetch("/api/administratif/jenis-izin", { cache: "no-store" }),
        fetch("/api/administratif/pengajuan-izin", { cache: "no-store" }),
      ])
      const [empData, recData, ltData, lrData] = await Promise.all([empRes.json(), recRes.json(), ltRes.json(), lrRes.json()])
      setEmployees(Array.isArray(empData.employees) ? empData.employees : [])
      setRecords(Array.isArray(recData.records) ? recData.records : [])
      setLeaveTypes(Array.isArray(ltData.leaveTypes) ? ltData.leaveTypes : [])
      setLeaveRequests(Array.isArray(lrData.leaveRequests) ? lrData.leaveRequests : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.name }))
  const leaveTypeOptions = leaveTypes.map((t) => ({ value: t.id, label: t.name }))

  const openCorrection = () => {
    setCorrectionForm({ employeeId: "", date: "", checkInAt: "", checkOutAt: "" })
    setCorrectionError("")
    setCorrectionOpen(true)
  }

  const handleSaveCorrection = async () => {
    if (!correctionForm.employeeId || !correctionForm.date) {
      setCorrectionError("Karyawan & tanggal wajib diisi")
      return
    }
    setCorrectionSaving(true)
    setCorrectionError("")
    try {
      const checkInAt = correctionForm.checkInAt ? `${correctionForm.date}T${correctionForm.checkInAt}:00` : null
      const checkOutAt = correctionForm.checkOutAt ? `${correctionForm.date}T${correctionForm.checkOutAt}:00` : null
      const res = await fetch("/api/administratif/absensi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: correctionForm.employeeId, date: correctionForm.date, checkInAt, checkOutAt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCorrectionError(data.error || "Gagal menyimpan")
        return
      }
      setCorrectionOpen(false)
      await load()
    } finally {
      setCorrectionSaving(false)
    }
  }

  const openLeave = () => {
    setLeaveForm({ employeeId: "", leaveTypeId: "", date: "", notes: "" })
    setLeaveError("")
    setLeaveOpen(true)
  }

  const handleSaveLeave = async () => {
    if (!leaveForm.employeeId || !leaveForm.leaveTypeId || !leaveForm.date) {
      setLeaveError("Karyawan, jenis izin, dan tanggal wajib diisi")
      return
    }
    setLeaveSaving(true)
    setLeaveError("")
    try {
      const res = await fetch("/api/administratif/pengajuan-izin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaveForm),
      })
      const data = await res.json()
      if (!res.ok) {
        setLeaveError(data.error || "Gagal menyimpan")
        return
      }
      setLeaveOpen(false)
      await load()
    } finally {
      setLeaveSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Absensi</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">Rekap kehadiran &amp; pengajuan izin/sakit/cuti.</p>
        </div>
        <Link href="/administratif/absensi/pengaturan">
          <Button variant="outline">
            <Settings className="w-4 h-4" /> Pengaturan
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <Tabs defaultValue="rekap">
          <TabList>
            <Tab value="rekap">Rekap Absensi</Tab>
            <Tab value="izin">Pengajuan Izin</Tab>
          </TabList>
          <TabPanels>
            <TabPanel value="rekap">
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <Button variant="primary" onClick={openCorrection}>
                    <Plus className="w-4 h-4" /> Koreksi Manual
                  </Button>
                </div>
                {records.length === 0 ? (
                  <Card variant="glass" padding="lg" className="text-center">
                    <p className="text-sm text-slate-600 font-medium">Belum ada data absensi.</p>
                  </Card>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Karyawan</TableHead>
                          <TableHead>Masuk</TableHead>
                          <TableHead>Pulang</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Sumber</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{new Date(r.date).toLocaleDateString("id-ID")}</TableCell>
                            <TableCell className="font-bold">{r.employee.name}</TableCell>
                            <TableCell>
                              {fmtTime(r.checkInAt)} {r.checkInLate && <Badge variant="warning" size="sm">Telat</Badge>}
                            </TableCell>
                            <TableCell>{fmtTime(r.checkOutAt)}</TableCell>
                            <TableCell>
                              <Badge variant={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">{r.source === "android" ? "Android" : "Manual (HR)"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            </TabPanel>

            <TabPanel value="izin">
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <Button variant="primary" onClick={openLeave}>
                    <Plus className="w-4 h-4" /> Tambah Pengajuan
                  </Button>
                </div>
                {leaveRequests.length === 0 ? (
                  <Card variant="glass" padding="lg" className="text-center">
                    <p className="text-sm text-slate-600 font-medium">Belum ada pengajuan izin.</p>
                  </Card>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Karyawan</TableHead>
                          <TableHead>Jenis</TableHead>
                          <TableHead>Catatan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leaveRequests.map((lr) => (
                          <TableRow key={lr.id}>
                            <TableCell>{new Date(lr.date).toLocaleDateString("id-ID")}</TableCell>
                            <TableCell className="font-bold">{lr.employee.name}</TableCell>
                            <TableCell>
                              <Badge variant="info">{lr.leaveType.name}</Badge>
                            </TableCell>
                            <TableCell>{lr.notes || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}

      <Modal
        isOpen={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        title="Koreksi Absensi Manual"
        subtitle="Dipakai kalau karyawan lupa absen atau kendala device."
        footer={
          <>
            <Button variant="outline" onClick={() => setCorrectionOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveCorrection} disabled={correctionSaving}>
              {correctionSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select label="Karyawan" options={employeeOptions} value={correctionForm.employeeId} onChange={(v) => setCorrectionForm({ ...correctionForm, employeeId: v })} />
          <Input
            label="Tanggal"
            type="date"
            value={correctionForm.date}
            onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
            error={correctionError}
          />
          <Input label="Jam Masuk" type="time" value={correctionForm.checkInAt} onChange={(e) => setCorrectionForm({ ...correctionForm, checkInAt: e.target.value })} />
          <Input label="Jam Pulang" type="time" value={correctionForm.checkOutAt} onChange={(e) => setCorrectionForm({ ...correctionForm, checkOutAt: e.target.value })} />
        </div>
      </Modal>

      <Modal
        isOpen={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Tambah Pengajuan Izin"
        subtitle="Langsung tersimpan tanpa approval."
        footer={
          <>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSaveLeave} disabled={leaveSaving}>
              {leaveSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select label="Karyawan" options={employeeOptions} value={leaveForm.employeeId} onChange={(v) => setLeaveForm({ ...leaveForm, employeeId: v })} error={leaveError} />
          <Select label="Jenis Izin" options={leaveTypeOptions} value={leaveForm.leaveTypeId} onChange={(v) => setLeaveForm({ ...leaveForm, leaveTypeId: v })} />
          <Input label="Tanggal" type="date" value={leaveForm.date} onChange={(e) => setLeaveForm({ ...leaveForm, date: e.target.value })} />
          <Textarea label="Catatan" value={leaveForm.notes} onChange={(e) => setLeaveForm({ ...leaveForm, notes: e.target.value })} rows={3} />
        </div>
      </Modal>
    </div>
  )
}
