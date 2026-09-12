"use client"

import { useEffect, useState } from "react"
import { Star, StarOff } from "lucide-react"

import { Alert, Button, Input, Modal, Select, Textarea } from "@/components/ui"

interface Opt {
  id: string
  name: string
}

/** Default jatuh tempo follow up = besok jam 09:00 — jam kerja paling awal setelah hari ini,
 *  biar SPV tidak perlu ngetik tanggal manual untuk kasus paling umum ("kejar besok pagi"). */
function defaultScheduledAt(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Tombol "Tandai Prioritas" (SPV/Manager) — dipakai di Detail Lead & header chat Inbox.
 *
 * Satu modal mengerjakan tiga hal sekaligus: tetapkan PIC, tandai prioritas, dan jadwalkan
 * follow up. Digabung bukan karena malas bikin tombol, tapi karena ketiganya saling bergantung:
 * Sales cuma bisa melihat lead yang dia jadi PIC-nya, jadi menandai tanpa menetapkan PIC =
 * tandanya tidak pernah muncul di layar siapa pun (lihat api/.../priority-pin/route.ts).
 */
export const PriorityPinButton: React.FC<{
  leadId: string
  pinnedAt: string | null
  pinNote: string | null
  pinnedByName?: string | null
  /** PIC aktif sekarang — dipakai sebagai nilai awal dropdown "Tugaskan ke". */
  currentPicId?: string | null
  viewerRole: string
  size?: "sm" | "md"
  onDone: () => void
}> = ({ leadId, pinnedAt, pinNote, pinnedByName, currentPicId, viewerRole, size = "sm", onDone }) => {
  const canPin = viewerRole === "MANAGER" || viewerRole === "SPV"
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<Opt[]>([])
  const [picId, setPicId] = useState(currentPicId ?? "")
  const [note, setNote] = useState("")
  const [scheduledAt, setScheduledAt] = useState(defaultScheduledAt())
  const [withFollowUp, setWithFollowUp] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPicId(currentPicId ?? "")
    setNote(pinNote ?? "")
    setError(null)
    fetch("/api/marketing/meta")
      .then((r) => r.json())
      .then((d) => d.users && setUsers(d.users))
      .catch(() => {})
  }, [open, currentPicId, pinNote])

  if (!canPin) return null

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/priority-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || undefined,
          assignedUserId: picId || undefined,
          scheduledAt: withFollowUp && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Gagal menandai prioritas")
        return
      }
      setOpen(false)
      onDone()
    } catch {
      setError("Gagal menghubungi server")
    } finally {
      setBusy(false)
    }
  }

  const unpin = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/priority-pin`, { method: "DELETE" })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || "Gagal melepas tanda")
        return
      }
      onDone()
    } catch {
      setError("Gagal menghubungi server")
    } finally {
      setBusy(false)
    }
  }

  if (pinnedAt) {
    return (
      <Button variant="secondary" size={size} isLoading={busy} onClick={unpin} title={pinNote ?? undefined}>
        <StarOff className="w-3.5 h-3.5" />
        Lepas Tanda{pinnedByName ? ` (${pinnedByName})` : ""}
      </Button>
    )
  }

  return (
    <>
      <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
        <Star className="w-3.5 h-3.5" />
        Tandai Prioritas
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Tandai Lead Prioritas" size="sm">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-500 font-medium">
            Lead ini akan naik ke paling atas daftar Lead, Inbox, dan Follow Up milik PIC-nya, sampai tandanya dilepas
            atau lead-nya Won/Lost.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <Select
            label="Tugaskan ke (PIC)"
            value={picId}
            onChange={setPicId}
            sizeVariant="sm"
            searchable
            options={[{ value: "", label: "— PIC tidak diubah —" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            helperText="Sales cuma bisa melihat lead yang dia jadi PIC-nya — kalau PIC-nya belum benar, tandanya tidak akan kelihatan."
          />
          <Textarea
            label="Alasan / instruksi"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            sizeVariant="sm"
            placeholder="mis. Sudah minta penawaran, kejar hari ini"
            helperText="Tampil sebagai keterangan di badge prioritas & jadi tujuan follow up."
          />
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 select-none">
            <input type="checkbox" checked={withFollowUp} onChange={(e) => setWithFollowUp(e.target.checked)} />
            Sekalian buatkan Follow Up
          </label>
          {withFollowUp && (
            <Input
              label="Jatuh tempo follow up"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              sizeVariant="sm"
            />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button size="sm" isLoading={busy} onClick={submit}>
              Tandai Prioritas
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
