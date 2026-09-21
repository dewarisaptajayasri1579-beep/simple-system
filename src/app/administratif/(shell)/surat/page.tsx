"use client"

import React, { useEffect, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Trash2 } from "lucide-react"

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

interface Letter {
  id: string
  number: string
  direction: "MASUK" | "KELUAR"
  subject: string
  date: string
  party: string
  notes: string | null
}

const DIRECTION_OPTIONS = [
  { value: "MASUK", label: "Surat Masuk" },
  { value: "KELUAR", label: "Surat Keluar" },
]

const emptyForm = {
  number: "",
  direction: "MASUK" as Letter["direction"],
  subject: "",
  date: "",
  party: "",
  notes: "",
}

export default function SuratPage() {
  const [letters, setLetters] = useState<Letter[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Letter | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/administratif/surat", { cache: "no-store" })
      const data = await res.json()
      setLetters(Array.isArray(data.letters) ? data.letters : [])
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

  const openEdit = (letter: Letter) => {
    setEditing(letter)
    setForm({
      number: letter.number,
      direction: letter.direction,
      subject: letter.subject,
      date: letter.date.slice(0, 10),
      party: letter.party,
      notes: letter.notes ?? "",
    })
    setError("")
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.number.trim() || !form.subject.trim() || !form.party.trim() || !form.date) {
      setError("Nomor, perihal, pihak terkait, dan tanggal wajib diisi")
      return
    }
    setSaving(true)
    setError("")
    try {
      const url = editing ? `/api/administratif/surat/${editing.id}` : "/api/administratif/surat"
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
    await fetch(`/api/administratif/surat/${id}`, { method: "DELETE" })
    setConfirmDeleteId(null)
    await load()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Surat Menyurat</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">Log surat masuk &amp; keluar.</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Tambah Surat
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : letters.length === 0 ? (
        <Card variant="glass" padding="lg" className="text-center">
          <p className="text-sm text-slate-600 font-medium">Belum ada surat tercatat.</p>
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Arah</TableHead>
                <TableHead>Perihal</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Pihak Terkait</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {letters.map((letter) => (
                <TableRow key={letter.id}>
                  <TableCell className="font-bold">{letter.number}</TableCell>
                  <TableCell>
                    <Badge variant={letter.direction === "MASUK" ? "info" : "warning"}>
                      {letter.direction === "MASUK" ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                      {letter.direction === "MASUK" ? "Masuk" : "Keluar"}
                    </Badge>
                  </TableCell>
                  <TableCell>{letter.subject}</TableCell>
                  <TableCell>{new Date(letter.date).toLocaleDateString("id-ID")}</TableCell>
                  <TableCell>{letter.party}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(letter)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {confirmDeleteId === letter.id ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(letter.id)}>
                            Yakin?
                          </Button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-semibold text-slate-500 px-1">
                            Batal
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(letter.id)}
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
        title={editing ? "Edit Surat" : "Tambah Surat"}
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
          <Input label="Nomor Surat" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} error={error} />
          <Select
            label="Arah"
            options={DIRECTION_OPTIONS}
            value={form.direction}
            onChange={(v) => setForm({ ...form, direction: v as Letter["direction"] })}
          />
          <Input label="Perihal" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <Input label="Tanggal" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input
            label="Pihak Terkait"
            placeholder="Pengirim (kalau masuk) / Tujuan (kalau keluar)"
            value={form.party}
            onChange={(e) => setForm({ ...form, party: e.target.value })}
          />
          <Textarea label="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
        </div>
      </Modal>
    </div>
  )
}
