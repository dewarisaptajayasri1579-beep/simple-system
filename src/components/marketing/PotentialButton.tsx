"use client"

import { useEffect, useState } from "react"
import { Gem } from "lucide-react"

import { Alert, Button, Modal, Textarea } from "@/components/ui"

/**
 * Tombol "Geser ke Lead Potensial" / "Lepas dari Potensial".
 *
 * Dua bentuk, karena dipakai di dua situasi kerja yang beda:
 *  - `mode="toggle"` (daftar lead) — SATU klik, tanpa modal. Ini alat kerja pemilihan massal:
 *    Tim menyusuri ratusan baris dan memilah satu per satu, jadi tiap dialog tambahan langsung
 *    jadi beban berkali-kali. Catatan dilewati di sini (memang opsional).
 *  - `mode="button"` (detail lead) — buka modal dengan kolom catatan opsional, karena di detail
 *    orangnya sudah membaca lead itu utuh dan biasanya punya alasan yang mau dititipkan.
 *
 * Keduanya memukul endpoint yang sama (POST/DELETE .../potential) yang boleh dipakai semua
 * anggota Tim — lihat catatan izin di route-nya.
 */
export const PotentialButton: React.FC<{
  leadId: string
  potentialAt: string | null
  potentialNote?: string | null
  mode?: "toggle" | "button"
  size?: "sm" | "md"
  onDone: () => void
}> = ({ leadId, potentialAt, potentialNote, mode = "button", size = "sm", onDone }) => {
  const isPotential = !!potentialAt
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(potentialNote ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setNote(potentialNote ?? "")
    setError(null)
  }, [open, potentialNote])

  const send = async (action: "add" | "remove", withNote?: string) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/marketing/leads/${leadId}/potential`, {
        method: action === "add" ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: action === "add" ? JSON.stringify({ note: withNote?.trim() || undefined }) : undefined,
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || "Gagal menyimpan")
        return
      }
      setOpen(false)
      onDone()
    } catch {
      setError("Gagal menyimpan — periksa koneksi")
    } finally {
      setBusy(false)
    }
  }

  if (mode === "toggle") {
    return (
      <button
        type="button"
        disabled={busy}
        title={isPotential ? "Lepas dari Lead Potensial" : "Geser ke Lead Potensial"}
        // stopPropagation + preventDefault: di tampilan mobile tombol ini duduk di dalam <Link>
        // ke detail lead, jadi tanpa ini sekali klik langsung pindah halaman dan pemilahan
        // massalnya jadi tidak mungkin.
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          void send(isPotential ? "remove" : "add")
        }}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide transition-colors disabled:opacity-50 cursor-pointer ${
          isPotential
            ? "border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200"
            : "border-slate-200 bg-white text-slate-400 hover:border-violet-300 hover:text-violet-700"
        }`}
      >
        <Gem className={`w-3 h-3 ${isPotential ? "text-violet-600" : ""}`} />
        {isPotential ? "Potensial" : "Geser"}
      </button>
    )
  }

  return (
    <>
      <Button
        size={size}
        variant={isPotential ? "secondary" : "primary"}
        leftIcon={<Gem className="w-3.5 h-3.5" />}
        isLoading={busy && !open}
        onClick={() => (isPotential ? void send("remove") : setOpen(true))}
      >
        {isPotential ? "Lepas dari Potensial" : "Geser ke Lead Potensial"}
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Geser ke Lead Potensial" size="sm">
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-slate-400">
            Lead ini masuk daftar <b>Lead Potensial</b> dan tetap ada di daftar Lead biasa. Tidak mengubah PIC,
            temperatur, maupun jadwal follow up.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <Textarea
            label="Kenapa potensial? (opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            sizeVariant="sm"
            placeholder="mis. budget sudah ada, tinggal nunggu approval owner"
          />
          <div className="flex gap-2">
            <Button size="sm" isLoading={busy} onClick={() => void send("add", note)}>
              Geser
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
