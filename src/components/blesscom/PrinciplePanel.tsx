"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react"

import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Modal,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"

export interface PrincipleRow {
  id: string
  name: string
  appUrl: string | null
  startedAtIso: string | null
  active: boolean
  deactivatedAtIso: string | null
  sortOrder: number
  /** Ikut ditagih di bulan yang sedang dilihat (hasil isPrincipleBillableForMonth di server). */
  billableThisMonth: boolean
}

function formatTanggal(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })
}

/** Tanggal hari ini (WIB) untuk nilai awal <input type="date">. */
function todayInputValue() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
}

export const PrinciplePanel: React.FC<{
  companies: { id: string; name: string }[]
  companyId: string
  monthLabel: string
  principles: PrincipleRow[]
  canEdit: boolean
  canDelete: boolean
}> = ({ companies, companyId, monthLabel, principles, canEdit, canDelete }) => {
  const router = useRouter()
  const pathname = usePathname()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addForm, setAddForm] = useState<{ name: string; appUrl: string; startedAt: string } | null>(null)
  const [editForm, setEditForm] = useState<{ id: string; name: string; appUrl: string; startedAt: string } | null>(null)
  // Modal "Non Aktif di tgl berapa" — tanggalnya yang menentukan mulai bulan mana principle ini
  // berhenti ditagih, jadi tidak boleh asal pakai hari ini tanpa ditanya.
  const [deactivate, setDeactivate] = useState<{ id: string; name: string; date: string } | null>(null)

  const call = async (url: string, init: RequestInit) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || "Gagal menyimpan")
        return false
      }
      router.refresh()
      return true
    } catch {
      setError("Gagal menghubungi server")
      return false
    } finally {
      setBusy(false)
    }
  }

  const aktif = principles.filter((p) => p.active).length
  const ditagih = principles.filter((p) => p.billableThisMonth).length

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Select-nya w-full bawaan — dibungkus div berlebar tetap, kalau tidak dia mendorong
            tombol Tambah ke baris berikutnya. */}
        <div className="w-full sm:w-64">
          <Select
            label="Perusahaan"
            sizeVariant="sm"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={companyId}
            onChange={(v) => router.push(`${pathname}?companyId=${v}`)}
          />
        </div>
        {canEdit && companyId && (
          <Button
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setAddForm({ name: "", appUrl: "", startedAt: todayInputValue() })}
          >
            Tambah Principle
          </Button>
        )}
      </div>

      <Card variant="panel" padding="none">
        <CardHeader className="p-5 sm:p-6 mb-0">
          <CardTitle>Daftar Principle</CardTitle>
          <CardDescription>
            {principles.length} principle · {aktif} aktif · <strong>{ditagih} ikut ditagih {monthLabel}</strong>
          </CardDescription>
        </CardHeader>
        <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No</TableHead>
                <TableHead>Nama Principle</TableHead>
                <TableHead>Link Aplikasi</TableHead>
                <TableHead>Mulai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{""}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {principles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-6">
                    Belum ada principle untuk perusahaan ini.
                  </TableCell>
                </TableRow>
              )}
              {principles.map((p, i) => (
                <TableRow key={p.id}>
                  <TableCell className="text-slate-400">{i + 1}</TableCell>
                  <TableCell className="font-bold text-slate-900">{p.name}</TableCell>
                  <TableCell>
                    {p.appUrl ? (
                      <a
                        href={p.appUrl.startsWith("http") ? p.appUrl : `https://${p.appUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                      >
                        {p.appUrl} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600">{formatTanggal(p.startedAtIso)}</TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge variant="success" size="sm">Aktif</Badge>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="secondary" size="sm">Non Aktif</Badge>
                        {p.deactivatedAtIso && (
                          <span className="text-[11px] text-slate-400">sejak {formatTanggal(p.deactivatedAtIso)}</span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-end">
                      {canEdit &&
                        (p.active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeactivate({ id: p.id, name: p.name, date: todayInputValue() })}
                          >
                            Non Aktif
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={busy}
                            onClick={() => call(`/api/principles/${p.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) })}
                          >
                            Aktifkan
                          </Button>
                        ))}
                      {canEdit && (
                        <button
                          onClick={() =>
                            setEditForm({
                              id: p.id,
                              name: p.name,
                              appUrl: p.appUrl ?? "",
                              startedAt: p.startedAtIso ? p.startedAtIso.slice(0, 10) : "",
                            })
                          }
                          className="p-1.5 text-slate-400 hover:text-blue-700"
                          title="Edit principle"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Hapus principle "${p.name}"? Lampiran invoice lama tetap utuh.`)) return
                            await call(`/api/principles/${p.id}`, { method: "DELETE" })
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600"
                          title="Hapus principle"
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
      </Card>

      <Modal
        isOpen={addForm !== null}
        onClose={() => setAddForm(null)}
        title="Tambah Principle"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddForm(null)}>
              Batal
            </Button>
            <Button
              isLoading={busy}
              disabled={!addForm?.name.trim()}
              onClick={async () => {
                if (!addForm) return
                const ok = await call("/api/principles", {
                  method: "POST",
                  body: JSON.stringify({
                    companyId,
                    name: addForm.name.trim(),
                    appUrl: addForm.appUrl.trim() || undefined,
                    startedAt: addForm.startedAt || undefined,
                  }),
                })
                if (ok) setAddForm(null)
              }}
            >
              Simpan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nama Principle"
            value={addForm?.name ?? ""}
            onChange={(e) => setAddForm((f) => (f ? { ...f, name: e.target.value } : f))}
            placeholder="mis. Cimory"
          />
          <Input
            label="Tanggal Mulai"
            type="date"
            value={addForm?.startedAt ?? ""}
            onChange={(e) => setAddForm((f) => (f ? { ...f, startedAt: e.target.value } : f))}
          />
          <Input
            label="Link Aplikasi (opsional)"
            value={addForm?.appUrl ?? ""}
            onChange={(e) => setAddForm((f) => (f ? { ...f, appUrl: e.target.value } : f))}
            placeholder="mis. cimory.blesscomapps.com"
          />
        </div>
      </Modal>

      <Modal
        isOpen={editForm !== null}
        onClose={() => setEditForm(null)}
        title="Edit Principle"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditForm(null)}>
              Batal
            </Button>
            <Button
              isLoading={busy}
              disabled={!editForm?.name.trim()}
              onClick={async () => {
                if (!editForm) return
                const ok = await call(`/api/principles/${editForm.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    name: editForm.name.trim(),
                    appUrl: editForm.appUrl.trim() || null,
                    startedAt: editForm.startedAt || null,
                  }),
                })
                if (ok) setEditForm(null)
              }}
            >
              Simpan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nama Principle"
            value={editForm?.name ?? ""}
            onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
          />
          <Input
            label="Tanggal Mulai"
            type="date"
            value={editForm?.startedAt ?? ""}
            onChange={(e) => setEditForm((f) => (f ? { ...f, startedAt: e.target.value } : f))}
          />
          <Input
            label="Link Aplikasi"
            value={editForm?.appUrl ?? ""}
            onChange={(e) => setEditForm((f) => (f ? { ...f, appUrl: e.target.value } : f))}
          />
        </div>
      </Modal>

      <Modal
        isOpen={deactivate !== null}
        onClose={() => setDeactivate(null)}
        title="Non-aktifkan Principle"
        subtitle={deactivate?.name}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeactivate(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              isLoading={busy}
              disabled={!deactivate?.date}
              onClick={async () => {
                if (!deactivate) return
                const ok = await call(`/api/principles/${deactivate.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ active: false, deactivatedAt: deactivate.date }),
                })
                if (ok) setDeactivate(null)
              }}
            >
              Non-aktifkan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Non aktif di tanggal"
            type="date"
            value={deactivate?.date ?? ""}
            onChange={(e) => setDeactivate((d) => (d ? { ...d, date: e.target.value } : d))}
          />
          <Alert variant="warning">
            Principle ini tidak ikut ditagih mulai <strong>bulan tanggal tersebut</strong> — bukan dihitung pro-rata,
            dan bukan ditagih penuh dulu. Invoice bulan-bulan sebelumnya tetap menghitungnya.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
