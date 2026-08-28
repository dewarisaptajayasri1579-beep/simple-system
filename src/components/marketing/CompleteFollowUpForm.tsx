"use client"

import { useState } from "react"

import { Alert, Button, Input, Select, Textarea } from "@/components/ui"

interface Opt {
  id: string
  name: string
}

/** Form kecil untuk menyelesaikan 1 follow up — dipakai di FollowUpBoard & LeadDetailClient. */
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

  return (
    <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2.5">
      {error && <Alert variant="error">{error}</Alert>}
      <Select
        options={resultTypes.map((r) => ({ value: r.id, label: r.name }))}
        value={resultTypeId}
        onChange={setResultTypeId}
        placeholder="Hasil follow up…"
        sizeVariant="sm"
      />
      <Textarea
        value={resultNote}
        onChange={(e) => setResultNote(e.target.value)}
        rows={2}
        placeholder="Catatan hasil (opsional)"
        sizeVariant="sm"
      />
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <input type="checkbox" checked={withNext} onChange={(e) => setWithNext(e.target.checked)} />
        Jadwalkan follow up lanjutan
      </label>
      {withNext && (
        <div className="flex flex-col gap-2">
          <Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} sizeVariant="sm" />
          <Input
            value={nextPurpose}
            onChange={(e) => setNextPurpose(e.target.value)}
            placeholder="Tujuan follow up lanjutan"
            sizeVariant="sm"
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} isLoading={busy}>
          Selesaikan
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
      </div>
    </div>
  )
}
