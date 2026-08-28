"use client"

import { useState } from "react"

interface Opt {
  id: string
  name: string
}

/** Form kecil untuk menyelesaikan 1 follow up — dipakai di FollowUpBoard & LeadDetailClient.
 *  Wajib pilih hasil; opsional langsung jadwalkan follow up lanjutan. */
export const CompleteFollowUpForm: React.FC<{
  followUpId: string
  resultTypes: Opt[]
  onDone: () => void
  onCancel: () => void
}> = ({ followUpId, resultTypes, onDone, onCancel }) => {
  const [resultTypeId, setResultTypeId] = useState("")
  const [resultNote, setResultNote] = useState("")
  const [withNext, setWithNext] = useState(false)
  const [nextAt, setNextAt] = useState("")
  const [nextPurpose, setNextPurpose] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!resultTypeId) {
      setError("Pilih hasil dulu")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { resultTypeId, resultNote: resultNote.trim() || undefined }
      if (withNext && nextAt && nextPurpose.trim()) {
        payload.next = { scheduledAt: new Date(nextAt).toISOString(), purpose: nextPurpose.trim() }
      }
      const res = await fetch(`/api/marketing/follow-ups/${followUpId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan")
        return
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const inputCls = "w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-400"

  return (
    <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2">
      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
      <select value={resultTypeId} onChange={(e) => setResultTypeId(e.target.value)} className={inputCls}>
        <option value="">Hasil follow up…</option>
        {resultTypes.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <textarea
        value={resultNote}
        onChange={(e) => setResultNote(e.target.value)}
        rows={2}
        placeholder="Catatan hasil (opsional)"
        className={`${inputCls} resize-none`}
      />
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <input type="checkbox" checked={withNext} onChange={(e) => setWithNext(e.target.checked)} />
        Jadwalkan follow up lanjutan
      </label>
      {withNext && (
        <div className="flex flex-col gap-2">
          <input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className={inputCls} />
          <input
            value={nextPurpose}
            onChange={(e) => setNextPurpose(e.target.value)}
            placeholder="Tujuan follow up lanjutan"
            className={inputCls}
          />
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold disabled:opacity-40">
          Selesaikan
        </button>
        <button onClick={onCancel} disabled={busy} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold">
          Batal
        </button>
      </div>
    </div>
  )
}
