"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { Trash2 } from "lucide-react"

import {
  Alert,
  Button,
  Card,
  Input,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"

export interface FieldSpec {
  key: string
  label: string
  type: "text" | "number" | "bool"
  /** hanya tampil (read-only) + jadi input saat "buat baru" */
  createOnly?: boolean
  width?: string
}

/** Editor generik untuk tabel master modul Marketing (Segment, LeadSource, LostReason,
 *  ActivityType, ResultType). Row yang masih dipakai (`usageCount > 0`) tidak bisa dihapus —
 *  nonaktifkan saja lewat toggle Aktif. */
export const MarketingMasterList: React.FC<{
  title: string
  endpoint: string
  listKey: string
  fields: FieldSpec[]
  canCreate?: boolean
  canDelete?: boolean
}> = ({ title, endpoint, listKey, fields, canCreate = true, canDelete = false }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState<Record<string, string>>({})
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" })
      const d = await res.json()
      if (d.error) return setError(d.error)
      setRows(d[listKey] ?? [])
      setCanEdit(Boolean(d.canEdit))
    } catch {
      setError("Gagal memuat")
    }
  }, [endpoint, listKey])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const saveField = async (id: string, key: string, value: unknown) => {
    setError(null)
    const res = await fetch(`${endpoint}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    })
    if (!res.ok) setError((await res.json()).error || "Gagal menyimpan")
    else load()
  }

  const create = async () => {
    setError(null)
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creating),
    })
    const d = await res.json()
    if (!res.ok) return setError(d.error || "Gagal")
    setCreating({})
    load()
  }

  const del = async (id: string) => {
    setError(null)
    const res = await fetch(`${endpoint}/${id}`, { method: "DELETE" })
    if (!res.ok) setError((await res.json()).error || "Gagal menghapus")
    else load()
    setConfirmId(null)
  }

  const colSpan = fields.length + (canDelete && canEdit ? 1 : 0)

  return (
    <Card variant="feature" padding="none">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-black text-slate-700"
      >
        {title}
        <span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {error && (
            <div className="mb-2">
              <Alert variant="error">{error}</Alert>
            </div>
          )}
          <TableContainer className="!rounded-xl">
            <Table>
              <TableHeader>
                <TableRow>
                  {fields.map((f) => (
                    <TableHead key={f.key}>{f.label}</TableHead>
                  ))}
                  {canDelete && canEdit && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const inUse = Number(r.usageCount ?? 0) > 0
                  return (
                    <Fragment key={r.id}>
                      <TableRow>
                        {fields.map((f) => (
                          <TableCell key={f.key} style={{ width: f.width }}>
                            {f.type === "bool" ? (
                              <Switch
                                checked={Boolean(r[f.key])}
                                disabled={!canEdit}
                                onChange={(e) => saveField(r.id, f.key, e.target.checked)}
                              />
                            ) : f.createOnly ? (
                              <span className="font-mono text-slate-500 text-xs">{r[f.key] ?? "—"}</span>
                            ) : (
                              <input
                                type={f.type === "number" ? "number" : "text"}
                                step="any"
                                defaultValue={r[f.key] ?? ""}
                                disabled={!canEdit}
                                onBlur={(e) => {
                                  const v = f.type === "number" ? Number(e.target.value) : e.target.value
                                  if (String(r[f.key] ?? "") !== String(e.target.value)) saveField(r.id, f.key, v)
                                }}
                                className="w-full px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-blue-400 bg-transparent text-xs outline-none disabled:cursor-default"
                              />
                            )}
                          </TableCell>
                        ))}
                        {canDelete && canEdit && (
                          <TableCell className="text-right">
                            <button
                              type="button"
                              onClick={() => !inUse && setConfirmId(confirmId === r.id ? null : r.id)}
                              disabled={inUse}
                              title={inUse ? `Dipakai ${r.usageCount} lead — nonaktifkan saja` : "Hapus"}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors ${
                                inUse
                                  ? "text-slate-300 cursor-not-allowed"
                                  : "text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TableCell>
                        )}
                      </TableRow>
                      {confirmId === r.id && (
                        <TableRow>
                          <TableCell colSpan={colSpan}>
                            <div className="flex items-center justify-end gap-2 py-1">
                              <span className="text-xs font-semibold text-slate-600">
                                Hapus &quot;{r.name ?? r.code}&quot; permanen?
                              </span>
                              <Button size="sm" variant="danger" onClick={() => del(r.id)}>
                                Ya, hapus
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => setConfirmId(null)}>
                                Batal
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {canCreate && canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {fields
                .filter((f) => f.type !== "bool" && (f.createOnly || f.key === "name" || f.key === "code"))
                .map((f) => (
                  <div key={f.key} className="w-40">
                    <Input
                      placeholder={f.label}
                      value={creating[f.key] ?? ""}
                      onChange={(e) => setCreating((c) => ({ ...c, [f.key]: e.target.value }))}
                      sizeVariant="sm"
                    />
                  </div>
                ))}
              <Button size="sm" onClick={create}>
                Tambah
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
