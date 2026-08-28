"use client"

import { useCallback, useEffect, useState } from "react"

export interface FieldSpec {
  key: string
  label: string
  type: "text" | "number" | "bool"
  /** hanya untuk form "buat baru" */
  createOnly?: boolean
  width?: string
}

/** Editor generik untuk tabel master modul Marketing (Segment, LeadSource, LostReason,
 *  ActivityType, ResultType). List dari `GET {endpoint}`, buat via `POST {endpoint}`,
 *  edit via `PATCH {endpoint}/{id}`, hapus via `DELETE {endpoint}/{id}` (opsional). */
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
  }

  const inputCls = "px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs outline-none focus:border-blue-400"

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-black text-slate-700"
      >
        {title}
        <span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {error && <p className="text-xs font-semibold text-rose-600 mb-2">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">
                <tr>
                  {fields.filter((f) => !f.createOnly || true).map((f) => (
                    <th key={f.key} className="text-left px-1.5 py-1">{f.label}</th>
                  ))}
                  {canDelete && canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    {fields.map((f) => (
                      <td key={f.key} className="px-1.5 py-1" style={{ width: f.width }}>
                        {f.type === "bool" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(r[f.key])}
                            disabled={!canEdit}
                            onChange={(e) => saveField(r.id, f.key, e.target.checked)}
                          />
                        ) : f.createOnly ? (
                          <span className="font-mono text-slate-500">{r[f.key] ?? "—"}</span>
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
                            className={`${inputCls} w-full disabled:bg-transparent disabled:border-transparent`}
                          />
                        )}
                      </td>
                    ))}
                    {canDelete && canEdit && (
                      <td className="px-1.5 py-1 text-right">
                        <button onClick={() => del(r.id)} className="text-[10px] font-bold text-rose-600">
                          hapus
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canCreate && canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {fields
                .filter((f) => f.type !== "bool" && (f.createOnly || f.key === "name" || f.key === "code"))
                .map((f) => (
                  <input
                    key={f.key}
                    placeholder={f.label}
                    value={creating[f.key] ?? ""}
                    onChange={(e) => setCreating((c) => ({ ...c, [f.key]: e.target.value }))}
                    className={inputCls}
                  />
                ))}
              <button onClick={create} className="px-2.5 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold">
                Tambah
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
