"use client"

import React, { useEffect, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import {
  Button,
  Badge,
  Card,
  Input,
  Select,
  Textarea,
  Modal,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"

interface Employee {
  id: string
  name: string
  position: string | null
  status: "AKTIF" | "NONAKTIF" | "KONTRAK" | "TETAP"
  joinDate: string | null
  phone: string | null
  email: string | null
  notes: string | null
  username: string | null
}

const STATUS_OPTIONS = [
  { value: "AKTIF", label: "Aktif" },
  { value: "NONAKTIF", label: "Nonaktif" },
  { value: "KONTRAK", label: "Kontrak" },
  { value: "TETAP", label: "Tetap" },
]

const STATUS_BADGE: Record<Employee["status"], "success" | "secondary" | "warning" | "info"> = {
  AKTIF: "success",
  NONAKTIF: "secondary",
  KONTRAK: "warning",
  TETAP: "info",
}

const emptyForm = {
  name: "",
  position: "",
  status: "AKTIF" as Employee["status"],
  joinDate: "",
  phone: "",
  email: "",
  notes: "",
  username: "",
  password: "",
}

export default function KaryawanPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/administratif/karyawan", { cache: "no-store" })
      const data = await res.json()
      setEmployees(Array.isArray(data.employees) ? data.employees : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setError("")
    setModalOpen(true)
  }

  const openEdit = (emp: Employee) => {
    setEditing(emp)
    setForm({
      name: emp.name,
      position: emp.position ?? "",
      status: emp.status,
      joinDate: emp.joinDate ? emp.joinDate.slice(0, 10) : "",
      phone: emp.phone ?? "",
      email: emp.email ?? "",
      notes: emp.notes ?? "",
      username: emp.username ?? "",
      password: "",
    })
    setError("")
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Nama wajib diisi")
      return
    }
    setSaving(true)
    setError("")
    try {
      const url = editing ? `/api/administratif/karyawan/${editing.id}` : "/api/administratif/karyawan"
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan")
        return
      }
      setModalOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/administratif/karyawan/${id}`, { method: "DELETE" })
    setConfirmDeleteId(null)
    await load()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Data Karyawan</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">Master data karyawan &amp; HRD.</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Tambah Karyawan
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : employees.length === 0 ? (
        <Card variant="glass" padding="lg" className="text-center">
          <p className="text-sm text-slate-600 font-medium">Belum ada data karyawan.</p>
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tanggal Masuk</TableHead>
                <TableHead>Kontak</TableHead>
                <TableHead>Login Android</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-bold">{emp.name}</TableCell>
                  <TableCell>{emp.position || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[emp.status]}>{STATUS_OPTIONS.find((s) => s.value === emp.status)?.label}</Badge>
                  </TableCell>
                  <TableCell>{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString("id-ID") : "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span>{emp.phone || "-"}</span>
                      <span className="text-slate-500">{emp.email || ""}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {emp.username ? <Badge variant="info">{emp.username}</Badge> : <span className="text-slate-400 text-xs">Belum diset</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(emp)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {confirmDeleteId === emp.id ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(emp.id)}>
                            Yakin?
                          </Button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-semibold text-slate-500 px-1">
                            Batal
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(emp.id)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                          aria-label="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Karyawan" : "Tambah Karyawan"}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={error} />
          <Input label="Jabatan" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <Select label="Status Kerja" options={STATUS_OPTIONS} value={form.status} onChange={(v) => setForm({ ...form, status: v as Employee["status"] })} />
          <Input label="Tanggal Masuk" type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
          <Input label="No. HP" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Textarea label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />

          <div className="pt-2 border-t border-slate-200/60">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Login Android (Absensi)</p>
            <div className="flex flex-col gap-4">
              <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              <Input
                label="Password"
                type="password"
                placeholder={editing ? "Kosongkan kalau tidak ingin mengubah" : ""}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
