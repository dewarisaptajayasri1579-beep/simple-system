"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react"

import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ui"

interface LinkedSpreadsheet {
  id: string
  name: string
  sourceUrl: string
  category: string | null
  description: string | null
  updatedAt: string
}

const emptyForm = { name: "", sourceUrl: "", category: "", description: "" }

export default function SpreadsheetListPage() {
  const [sheets, setSheets] = useState<LinkedSpreadsheet[]>([])
  const [loading, setLoading] = useState(true)
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null)
  const [serviceAccountError, setServiceAccountError] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LinkedSpreadsheet | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/spreadsheets", { cache: "no-store" })
      const data = await res.json()
      setSheets(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  const loadServiceAccount = async () => {
    try {
      const res = await fetch("/api/spreadsheets/service-account", { cache: "no-store" })
      const data = await res.json()
      if (res.ok) setServiceAccountEmail(data.email)
      else setServiceAccountError(data.error || "Gagal mengambil email Service Account")
    } catch {
      setServiceAccountError("Gagal mengambil email Service Account")
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
    if (!serviceAccountEmail && !serviceAccountError) loadServiceAccount()
  }

  const openEdit = (sheet: LinkedSpreadsheet) => {
    setEditing(sheet)
    setForm({
      name: sheet.name,
      sourceUrl: sheet.sourceUrl,
      category: sheet.category ?? "",
      description: sheet.description ?? "",
    })
    setError("")
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError("Nama wajib diisi")
      return
    }
    if (!form.sourceUrl.trim()) {
      setError("URL Google Sheets wajib diisi")
      return
    }
    setSaving(true)
    setError("")
    try {
      const url = editing ? `/api/spreadsheets/${editing.id}` : "/api/spreadsheets"
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
    await fetch(`/api/spreadsheets/${id}`, { method: "DELETE" })
    setConfirmDeleteId(null)
    await load()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900">Daftar Spreadsheet</h1>
          <p className="text-sm text-slate-600 font-medium mt-1">Google Sheets yang di-link supaya bisa dilihat dari sini.</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Tambah Sheet
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : sheets.length === 0 ? (
        <Card variant="glass" padding="lg" className="text-center">
          <p className="text-sm text-slate-600 font-medium">Belum ada spreadsheet yang di-link.</p>
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheets.map((sheet) => (
                <TableRow key={sheet.id}>
                  <TableCell className="font-bold">
                    <Link href={`/spreadsheet/${sheet.id}`} className="hover:text-blue-700">
                      {sheet.name}
                    </Link>
                  </TableCell>
                  <TableCell>{sheet.category || "-"}</TableCell>
                  <TableCell className="max-w-xs truncate">{sheet.description || "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={sheet.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                        aria-label="Buka di Google Sheets"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => openEdit(sheet)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {confirmDeleteId === sheet.id ? (
                        <>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(sheet.id)}>
                            Yakin?
                          </Button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs font-semibold text-slate-500 px-1">
                            Batal
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(sheet.id)}
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
        title={editing ? "Edit Spreadsheet" : "Tambah Spreadsheet"}
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
          {!editing && (
            serviceAccountEmail ? (
              <Alert variant="info">
                Sebelum nge-link, share sheet ini (role <strong>Viewer</strong>) ke email Service Account:{" "}
                <code className="font-bold">{serviceAccountEmail}</code>
              </Alert>
            ) : serviceAccountError ? (
              <Alert variant="warning">{serviceAccountError}</Alert>
            ) : (
              <div className="flex justify-center py-2">
                <Spinner size="sm" />
              </div>
            )
          )}
          <Input label="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            label="URL Google Sheets"
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            error={error}
          />
          <Input label="Kategori" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Textarea label="Deskripsi" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>
      </Modal>
    </div>
  )
}
