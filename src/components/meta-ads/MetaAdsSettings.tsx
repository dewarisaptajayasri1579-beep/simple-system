"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, TriangleAlert, CheckCircle2 } from "lucide-react"

import { Alert, Badge, Button, Card, Input, Modal, Switch } from "@/components/ui"

type MetaAdsAccountRow = {
  id: string
  name: string
  adAccountId: string
  isActive: boolean
  lastSyncError: string | null
  lastSyncCheckedAt: string | null
  createdAt: string
}

const EMPTY_FORM = { name: "", adAccountId: "", accessToken: "", isActive: true }

export function MetaAdsSettings() {
  const [accounts, setAccounts] = useState<MetaAdsAccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MetaAdsAccountRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/meta-ads/settings")
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal memuat")
      setAccounts(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(account: MetaAdsAccountRow) {
    setEditing(account)
    setForm({ name: account.name, adAccountId: account.adAccountId, accessToken: "", isActive: account.isActive })
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.adAccountId.trim()) {
      setFormError("Nama dan Ad Account ID wajib diisi")
      return
    }
    if (!editing && !form.accessToken.trim()) {
      setFormError("Access Token wajib diisi")
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch("/api/meta-ads/settings", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan")
      setModalOpen(false)
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus akun Meta Ads ini? Koneksi ke akun tersebut akan terputus.")) return
    const res = await fetch(`/api/meta-ads/settings?id=${id}`, { method: "DELETE" })
    if (res.ok) load()
  }

  async function handleToggleActive(account: MetaAdsAccountRow, checked: boolean) {
    await fetch("/api/meta-ads/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, isActive: checked }),
    })
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Pengaturan Meta Ads</h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            Kredensial API buat narik data performa iklan. Akun yang ditandai Aktif dipakai untuk halaman Performa Iklan.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Tambah Akun
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {!loading && accounts.length === 0 && !error && (
        <Card variant="feature" padding="lg" className="text-center">
          <p className="text-sm text-slate-600 font-medium">Belum ada akun Meta Ads yang dikonek. Klik &quot;Tambah Akun&quot; untuk mulai.</p>
        </Card>
      )}

      <div className="space-y-3">
        {accounts.map((account) => (
          <Card key={account.id} variant="feature" padding="md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-slate-800">{account.name}</p>
                  <Badge variant={account.isActive ? "success" : "secondary"}>{account.isActive ? "Aktif" : "Nonaktif"}</Badge>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{account.adAccountId}</p>
                {account.lastSyncError ? (
                  <div className="flex items-start gap-1.5 mt-1.5 text-amber-700">
                    <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] font-semibold leading-snug">{account.lastSyncError}</p>
                  </div>
                ) : account.lastSyncCheckedAt ? (
                  <div className="flex items-center gap-1.5 mt-1.5 text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <p className="text-[11px] font-semibold">Terhubung, terakhir dicek {new Date(account.lastSyncCheckedAt).toLocaleString("id-ID")}</p>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Switch checked={account.isActive} onChange={(e) => handleToggleActive(account, e.target.checked)} />
                <Button variant="secondary" size="sm" onClick={() => openEdit(account)}>
                  Edit
                </Button>
                <button
                  type="button"
                  onClick={() => handleDelete(account.id)}
                  className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  aria-label="Hapus"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Akun Meta Ads" : "Tambah Akun Meta Ads"}>
        <div className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Nama</label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="mis. Ads Utama" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">Ad Account ID</label>
            <Input
              value={form.adAccountId}
              onChange={(e) => setForm((f) => ({ ...f, adAccountId: e.target.value }))}
              placeholder="act_1234567890"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1 block">
              Access Token {editing && <span className="font-normal text-slate-400">(kosongkan kalau tidak diganti)</span>}
            </label>
            <Input
              type="password"
              value={form.accessToken}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              placeholder="EAAG..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
