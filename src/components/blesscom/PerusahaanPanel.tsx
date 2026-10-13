"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Plus, Trash2 } from "lucide-react"

import {
  Alert,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CurrencyInput,
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

export interface PerusahaanTier {
  id: string
  label: string
  fromCount: number
  toCount: number | null
  unitPrice: number
}

export interface PerusahaanRow {
  id: string
  name: string
  clientId: string | null
  clientName: string | null
  principleCount: number
  tiers: PerusahaanTier[]
}

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0)
}

/** Ringkasan satu tingkatan harga dalam kalimat, mis. "Principle 1–10: Rp 500.000 / principle". */
function tierLabel(t: PerusahaanTier) {
  const range = t.toCount == null ? `${t.fromCount} ke atas` : t.fromCount === t.toCount ? `${t.fromCount}` : `${t.fromCount}–${t.toCount}`
  return `Principle ${range}: ${formatRupiah(t.unitPrice)}`
}

export const PerusahaanPanel: React.FC<{
  companies: PerusahaanRow[]
  clients: { id: string; name: string }[]
  canEdit: boolean
  canEditTier: boolean
}> = ({ companies, clients, canEdit, canEditTier }) => {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<{ id: string | null; name: string; clientId: string } | null>(null)
  const [tierFor, setTierFor] = useState<PerusahaanRow | null>(null)
  const [tierForm, setTierForm] = useState<{ id: string | null; label: string; fromCount: string; toCount: string; unitPrice: number } | null>(null)

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

  const saveCompany = async () => {
    if (!form || !form.name.trim()) return
    const ok = await call(form.id ? `/api/principle-companies/${form.id}` : "/api/principle-companies", {
      method: form.id ? "PATCH" : "POST",
      body: JSON.stringify({ name: form.name.trim(), clientId: form.clientId || null }),
    })
    if (ok) setForm(null)
  }

  const saveTier = async () => {
    if (!tierForm || !tierFor || !tierForm.label.trim()) return
    const payload = {
      companyId: tierFor.id,
      label: tierForm.label.trim(),
      fromCount: Number(tierForm.fromCount) || 1,
      toCount: tierForm.toCount.trim() === "" ? null : Number(tierForm.toCount),
      unitPrice: tierForm.unitPrice,
    }
    const ok = await call(tierForm.id ? `/api/principle-tiers/${tierForm.id}` : "/api/principle-tiers", {
      method: tierForm.id ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    })
    if (ok) setTierForm(null)
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <Card variant="panel" padding="none">
        <CardHeader className="p-5 sm:p-6 mb-0 flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Perusahaan</CardTitle>
            <CardDescription>
              Client yang ditagih per principle. Tingkatan harganya diatur di sini — bukan di kode — karena tiap
              perusahaan beda kesepakatan.
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setForm({ id: null, name: "", clientId: "" })} className="flex-shrink-0 whitespace-nowrap">
              <Plus className="w-4 h-4" /> Tambah
            </Button>
          )}
        </CardHeader>
        <TableContainer className="rounded-none border-x-0 border-b-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Perusahaan</TableHead>
                <TableHead>Client Penagihan</TableHead>
                <TableHead>Principle</TableHead>
                <TableHead>Tingkatan Harga</TableHead>
                <TableHead>{""}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-6">
                    Belum ada perusahaan.
                  </TableCell>
                </TableRow>
              )}
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-bold text-slate-900">{c.name}</TableCell>
                  <TableCell>
                    {c.clientName ?? <span className="text-rose-600 font-semibold">belum ditautkan</span>}
                  </TableCell>
                  <TableCell>{c.principleCount}</TableCell>
                  <TableCell>
                    {c.tiers.length === 0 ? (
                      <span className="text-rose-600 font-semibold">belum diatur</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {c.tiers.map((t) => (
                          <span key={t.id} className="text-xs">
                            <span className="font-semibold text-slate-700">{t.label}</span>{" "}
                            <span className="text-slate-500">— {tierLabel(t)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-end">
                      {canEditTier && (
                        <Button size="sm" variant="outline" onClick={() => setTierFor(c)}>
                          Atur Harga
                        </Button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setForm({ id: c.id, name: c.name, clientId: c.clientId ?? "" })}
                          className="p-1.5 text-slate-400 hover:text-blue-700"
                          title="Edit perusahaan"
                        >
                          <Pencil className="w-4 h-4" />
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
        isOpen={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit Perusahaan" : "Tambah Perusahaan"}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button onClick={saveCompany} isLoading={busy} disabled={!form?.name.trim()}>
              Simpan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nama Perusahaan"
            value={form?.name ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
            placeholder="mis. Blesscom"
          />
          <Select
            label="Client Penagihan"
            searchable
            placeholder="Pilih client yang ditagih"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            value={form?.clientId ?? ""}
            onChange={(v) => setForm((f) => (f ? { ...f, clientId: v } : f))}
            helperText="Invoice Over Principle dibuat atas nama client ini, jadi tembus ke Piutang & Pembayaran seperti invoice biasa."
          />
        </div>
      </Modal>

      <Modal
        isOpen={tierFor !== null}
        onClose={() => {
          setTierFor(null)
          setTierForm(null)
        }}
        title={`Tingkatan Harga — ${tierFor?.name ?? ""}`}
        subtitle="Hitungannya bertingkat: tiap tingkat menagih jumlah principle yang masuk rentangnya."
        size="lg"
      >
        <div className="space-y-3">
          {(tierFor?.tiers.length ?? 0) === 0 && !tierForm && (
            <p className="text-sm text-slate-500">Belum ada tingkatan harga.</p>
          )}
          {tierFor?.tiers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white">
              <div>
                <p className="text-sm font-bold text-slate-800">{t.label}</p>
                <p className="text-xs text-slate-500">{tierLabel(t)}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() =>
                    setTierForm({
                      id: t.id,
                      label: t.label,
                      fromCount: String(t.fromCount),
                      toCount: t.toCount == null ? "" : String(t.toCount),
                      unitPrice: t.unitPrice,
                    })
                  }
                  className="p-1.5 text-slate-400 hover:text-blue-700"
                  title="Edit tingkatan"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Hapus tingkatan "${t.label}"?`)) return
                    const ok = await call(`/api/principle-tiers/${t.id}`, { method: "DELETE" })
                    if (ok) setTierFor(null)
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-600"
                  title="Hapus tingkatan"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {tierForm ? (
            <div className="space-y-3 p-4 rounded-2xl border border-blue-200 bg-blue-50/40">
              <Input
                label="Keterangan (dicetak di baris invoice)"
                value={tierForm.label}
                onChange={(e) => setTierForm((f) => (f ? { ...f, label: e.target.value } : f))}
                placeholder="mis. Over Principle 10 Pertama"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Mulai principle ke-"
                  type="number"
                  min={1}
                  value={tierForm.fromCount}
                  onChange={(e) => setTierForm((f) => (f ? { ...f, fromCount: e.target.value } : f))}
                />
                <Input
                  label="Sampai principle ke-"
                  type="number"
                  min={1}
                  value={tierForm.toCount}
                  onChange={(e) => setTierForm((f) => (f ? { ...f, toCount: e.target.value } : f))}
                  helperText="Kosongkan = tanpa batas atas"
                />
              </div>
              <CurrencyInput
                label="Harga per principle"
                value={tierForm.unitPrice}
                onChange={(v) => setTierForm((f) => (f ? { ...f, unitPrice: v } : f))}
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setTierForm(null)}>
                  Batal
                </Button>
                <Button size="sm" onClick={saveTier} isLoading={busy} disabled={!tierForm.label.trim()}>
                  Simpan Tingkatan
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setTierForm({
                  id: null,
                  label: "",
                  fromCount: String((tierFor?.tiers.at(-1)?.toCount ?? 0) + 1),
                  toCount: "",
                  unitPrice: 0,
                })
              }
            >
              <Plus className="w-4 h-4" /> Tambah Tingkatan
            </Button>
          )}

          <Alert variant="info">
            Contoh Blesscom: tingkat 1 <Badge size="sm">1–10</Badge> Rp 500.000 + tingkat 2{" "}
            <Badge size="sm">11 ke atas</Badge> Rp 400.000. Kalau 14 principle aktif → 10×500rb + 4×400rb = Rp 6.600.000.
          </Alert>
        </div>
      </Modal>
    </div>
  )
}
