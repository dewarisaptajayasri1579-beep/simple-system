"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"

interface SegmentOpt {
  id: string
  name: string
}

/** Chip picker segmen — dipakai di Detail Lead & Detail Inbox (percakapan) supaya staf bisa
 *  ganti ATAU bikin segmen baru tanpa pindah menu ke Marketing > Pengaturan > Segmen. "+ Baru"
 *  langsung bikin segmen (POST /api/marketing/segments — boleh Sales juga sejak aturan baru,
 *  lihat komentar di route itu) lalu otomatis di-assign lewat `onChange`. */
export const SegmentPicker: React.FC<{
  value: string
  onChange: (segmentId: string) => Promise<void> | void
  disabled?: boolean
}> = ({ value, onChange, disabled }) => {
  const [segments, setSegments] = useState<SegmentOpt[]>([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/marketing/segments")
      .then((r) => r.json())
      .then((d) =>
        setSegments(
          (d.segments ?? [])
            .filter((s: { isActive: boolean }) => s.isActive)
            .map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
        ),
      )
      .catch(() => {})
  }, [])

  const pick = async (id: string) => {
    if (disabled || busy || id === value) return
    setBusy(true)
    try {
      await onChange(id)
    } finally {
      setBusy(false)
    }
  }

  const createSegment = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError("")
    // Kode dari nama (huruf besar, non-alfanumerik jadi "_") — kalau bentrok, server yang balikin
    // error "kode sudah dipakai", staf tinggal ganti nama sedikit.
    const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `SEG_${Date.now()}`
    const res = await fetch("/api/marketing/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || "Gagal membuat segmen")
      setBusy(false)
      return
    }
    setSegments((prev) => [...prev, { id: data.segment.id, name }])
    setNewName("")
    setAdding(false)
    await onChange(data.segment.id)
    setBusy(false)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {[{ id: "", name: "— belum —" }, ...segments].map((s) => {
          const active = (value || "") === s.id
          return (
            <button
              key={s.id || "none"}
              type="button"
              disabled={disabled || busy || active}
              onClick={() => pick(s.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                active
                  ? "bg-blue-700 text-white border-blue-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
              }`}
            >
              {s.name}
            </button>
          )
        })}
        {!disabled && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="px-2.5 py-1 rounded-full text-xs font-bold border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Baru
          </button>
        )}
      </div>
      {adding && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createSegment()
              if (e.key === "Escape") {
                setAdding(false)
                setNewName("")
              }
            }}
            placeholder="Nama segmen baru…"
            disabled={busy}
            className="text-xs px-2.5 py-1 rounded-full border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          />
          <button type="button" onClick={createSegment} disabled={busy || !newName.trim()} className="text-xs font-bold text-blue-700 disabled:opacity-50">
            Simpan
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setNewName("")
            }}
            className="text-xs font-bold text-slate-400"
          >
            Batal
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
    </div>
  )
}
